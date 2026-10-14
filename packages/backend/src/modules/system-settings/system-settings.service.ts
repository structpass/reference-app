import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ok } from '../../common/dto';
import { SystemSettingsRepository } from './repositories/system-settings.repository';
import { UpdateSystemSettingDto } from './dto/update-system-setting.dto';
import { toSystemSettingWithUpdaterResponse } from './system-settings.mapper';

/** UI テーマキー（フロントエンドの THEME_IDS と同期させること） */
export const UI_THEME_KEY = 'system.ui.theme';
const UI_THEME_VALUES = ['default', 'plains', 'island', 'mountain', 'swamp', 'forest'] as const;

/** キー特化バリデーション: 列挙系のキーは値リストでホワイトリスト検証 */
const ENUM_VALIDATORS: Record<string, readonly string[]> = {
  [UI_THEME_KEY]: UI_THEME_VALUES,
};

/**
 * `getPublicConfig` で返す公開キーのホワイトリスト。
 * 新しいフロント参照キーを増やす場合は明示的にここへ追加すること。
 * （ホワイトリストにない設定値は public エンドポイントから絶対に漏れない）
 */
const PUBLIC_CONFIG_KEYS: ReadonlySet<string> = new Set<string>([UI_THEME_KEY]);

@Injectable()
export class SystemSettingsService {
  /**
   * Single-process in-memory cache.
   * If the backend is scaled horizontally, replace with a shared cache (Redis).
   */
  private cache = new Map<string, string>();
  private cacheLoaded = false;

  constructor(private readonly repo: SystemSettingsRepository) {}

  private async ensureCache() {
    if (this.cacheLoaded) return;
    const settings = await this.repo.findAllForCache();
    for (const s of settings) {
      this.cache.set(s.key, s.value);
    }
    this.cacheLoaded = true;
  }

  private invalidateCache() {
    this.cache.clear();
    this.cacheLoaded = false;
  }

  async findAll() {
    const raw = await this.repo.findAllWithUpdater();
    const settings = raw.map(toSystemSettingWithUpdaterResponse);
    return ok(settings);
  }

  async findByKey(key: string) {
    const setting = await this.repo.findByKey(key);

    if (!setting) {
      throw new NotFoundException(`System setting '${key}' not found`);
    }

    return ok(toSystemSettingWithUpdaterResponse(setting));
  }

  async updateByKey(key: string, dto: UpdateSystemSettingDto, userId: string) {
    const setting = await this.repo.findByKeyBare(key);

    if (!setting) {
      throw new NotFoundException(`System setting '${key}' not found`);
    }

    this.validateValue(setting.key, setting.valueType, dto.value);

    const updated = await this.repo.updateByKey(key, dto.value, userId);

    this.invalidateCache();

    return ok(toSystemSettingWithUpdaterResponse(updated));
  }

  async bulkUpdate(updates: Array<{ key: string; value: string }>, userId: string) {
    const results = await this.repo.bulkUpdateAtomic(updates, userId, (existingSettings) => {
      const settingMap = new Map(existingSettings.map((s) => [s.key, s]));
      for (const u of updates) {
        const setting = settingMap.get(u.key);
        if (!setting) {
          throw new NotFoundException(`System setting '${u.key}' not found`);
        }
        this.validateValue(setting.key, setting.valueType, u.value);
      }
    });

    this.invalidateCache();

    return ok(results.map(toSystemSettingWithUpdaterResponse));
  }

  /**
   * フロントエンド向け公開設定（認証済み全ユーザーアクセス可）。
   * `PUBLIC_CONFIG_KEYS` ホワイトリストにあるキーのみ返す。
   */
  async getPublicConfig() {
    await this.ensureCache();

    const config: Record<string, string> = {};
    for (const [key, value] of this.cache) {
      if (PUBLIC_CONFIG_KEYS.has(key)) {
        config[key] = value;
      }
    }

    return ok(config);
  }

  /**
   * 特定キーの値を取得（**バックエンド内部利用専用**）。
   *
   * 注意: このメソッドは `PUBLIC_CONFIG_KEYS` ホワイトリストを通さない。
   * 認証済みリクエストハンドラ内 / バックエンドサービス間の連携でのみ使用すること。
   * フロントエンドへ露出する値は必ず `getPublicConfig` 経由（whitelist で絞られる）に通すこと。
   * 機密値（API key 等）を System Setting に格納する場合も、このメソッドからは取得できる前提で
   * アクセス制御をリクエストハンドラ側に置く設計。
   */
  async getValue(key: string, fallback?: string): Promise<string> {
    await this.ensureCache();
    return this.cache.get(key) ?? fallback ?? '';
  }

  private validateValue(key: string, valueType: string, value: string) {
    // キー特化のホワイトリスト検証（列挙系）
    const allowed = ENUM_VALIDATORS[key];
    if (allowed && !allowed.includes(value)) {
      throw new BadRequestException(`Value for '${key}' must be one of: ${allowed.join(', ')}`);
    }

    switch (valueType) {
      case 'NUMBER': {
        const num = Number(value);
        if (!Number.isFinite(num)) {
          throw new BadRequestException(`Value must be a valid number for NUMBER type`);
        }
        break;
      }
      case 'BOOLEAN': {
        if (value !== 'true' && value !== 'false') {
          throw new BadRequestException(`Value must be 'true' or 'false' for BOOLEAN type`);
        }
        break;
      }
      case 'JSON': {
        try {
          JSON.parse(value);
        } catch {
          throw new BadRequestException(`Value must be valid JSON for JSON type`);
        }
        break;
      }
    }
  }
}
