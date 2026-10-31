import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ok, okPaginated, okMessage, buildPaginatedMeta } from '../../common/dto';
import { ObjectTypesRepository } from './repositories/object-types.repository';
import { toObjectTypeResponse, toCustomRecordResponse } from './object-types.mapper';
import { validateCustomRecordData } from './custom-record.validation';
import { CreateObjectTypeDto } from './dto/create-object-type.dto';
import { UpdateObjectTypeDto } from './dto/update-object-type.dto';
import { CreateCustomRecordDto } from './dto/create-custom-record.dto';
import { UpdateCustomRecordDto } from './dto/update-custom-record.dto';
import { PermissionsService } from '../permissions/permissions.service';
import { isValidObjectTypeKey, objectTypePermissionId } from '@struct-pass/shared';
import { UserRole } from '@prisma/client';

@Injectable()
export class ObjectTypesService {
  constructor(
    private readonly repo: ObjectTypesRepository,
    private readonly permissions: PermissionsService,
  ) {}

  async create(dto: CreateObjectTypeDto) {
    const fieldKeys = dto.fieldDefs.map((field) => field.key);
    if (new Set(fieldKeys).size !== fieldKeys.length) {
      throw new BadRequestException('fieldDefs.key must be unique within an object type');
    }

    const item = await this.repo.create({
      key: dto.key,
      name: dto.name,
      icon: dto.icon ?? null,
      sortOrder: dto.sortOrder ?? 0,
      fieldDefs: dto.fieldDefs.map((field, index) => ({
        key: field.key,
        label: field.label,
        type: field.type,
        required: field.required ?? false,
        sortOrder: index + 1,
      })),
    });

    return ok(toObjectTypeResponse(item));
  }

  async update(key: string, dto: UpdateObjectTypeDto) {
    this.assertUniqueFieldKeys(dto.fieldDefs);
    const item = await this.repo.updateDefinitionAtomic(
      key,
      {
        name: dto.name,
        icon: dto.icon ?? null,
        sortOrder: dto.sortOrder ?? 0,
        fieldDefs: dto.fieldDefs.map((field, index) => ({
          key: field.key,
          label: field.label,
          type: field.type,
          required: field.required ?? false,
          sortOrder: index + 1,
        })),
      },
      (current, recordCount) => {
        if (!current) throw new NotFoundException('ObjectType not found');
        if (current.isPreset) throw new ForbiddenException('Preset ObjectType cannot be updated');
        if (recordCount === 0) return;

        const nextByKey = new Map(dto.fieldDefs.map((field) => [field.key, field]));
        for (const existing of current.fieldDefs) {
          const next = nextByKey.get(existing.key);
          if (!next) {
            throw new ConflictException(
              'Fields used by existing records cannot be removed or renamed',
            );
          }
          if (next.type !== existing.type) {
            throw new ConflictException('Field types cannot change while records exist');
          }
          if (!existing.required && (next.required ?? false)) {
            throw new ConflictException(
              'Optional fields cannot become required while records exist',
            );
          }
        }
        const existingKeys = new Set(current.fieldDefs.map((field) => field.key));
        if (
          dto.fieldDefs.some((field) => !existingKeys.has(field.key) && (field.required ?? false))
        ) {
          throw new ConflictException('New fields must be optional while records exist');
        }
      },
    );
    return ok(toObjectTypeResponse(item));
  }

  private assertUniqueFieldKeys(fields: Array<{ key: string }>) {
    const fieldKeys = fields.map((field) => field.key);
    if (new Set(fieldKeys).size !== fieldKeys.length) {
      throw new BadRequestException('fieldDefs.key must be unique within an object type');
    }
  }

  async findAll() {
    const items = await this.repo.findAll();
    return ok(items.map(toObjectTypeResponse));
  }

  async findVisibleForUser(role: UserRole | null) {
    const [items, permissionMap] = await Promise.all([
      this.repo.findAll(),
      this.permissions.getEffectivePermissionMap(role),
    ]);
    const staticView = permissionMap.get('object-types')?.canView === true;
    const visible = items.filter((item) => {
      if (item.isPreset) return staticView;
      return (
        isValidObjectTypeKey(item.key) &&
        permissionMap.get(objectTypePermissionId(item.key))?.canView === true
      );
    });
    return ok(visible.map(toObjectTypeResponse));
  }

  async findByKey(key: string) {
    const item = await this.repo.findByKey(key);
    if (!item) {
      throw new NotFoundException('ObjectType not found');
    }
    return ok(toObjectTypeResponse(item));
  }

  /**
   * 種別に紐づく自由定義データの一覧（ref-0076）。プリセット種別（商品・倉庫・運送会社・仕入先・
   * カテゴリー）は既存マスタが専用テーブルで動いているため、常に空ページを返す（二重表示を作らない）。
   */
  async findRecords(key: string, page: number, limit: number) {
    const type = await this.repo.findByKeyBare(key);
    if (!type) {
      throw new NotFoundException('ObjectType not found');
    }
    if (type.isPreset) {
      return okPaginated([], buildPaginatedMeta(0, page, limit));
    }
    const { items, total } = await this.repo.findRecords(type.id, page, limit);
    return okPaginated(items.map(toCustomRecordResponse), buildPaginatedMeta(total, page, limit));
  }

  /**
   * 自由定義データ 1 件を取得する。対象 CustomRecord が指定の ObjectType に属さない
   * （または存在しない）場合は 404（更新・削除と同じ所属境界）。プリセット種別は専用マスタが
   * 正本でレコードを持たないため 404。一覧のページ窓に依存しない単体取得の経路。
   */
  async findRecord(key: string, id: number) {
    const type = await this.repo.findByKeyBare(key);
    if (!type) {
      throw new NotFoundException('ObjectType not found');
    }
    if (type.isPreset) {
      throw new NotFoundException('CustomRecord not found');
    }
    const record = await this.repo.findRecordInObjectType(type.id, id);
    if (!record) {
      throw new NotFoundException('CustomRecord not found');
    }
    return ok(toCustomRecordResponse(record));
  }

  /**
   * 自由定義データを作成する（ref-0098）。FieldDef を正本に data を検証し、
   * プリセット ObjectType への書込みを 403 で拒否する。Serializable tx 境界（ref-0097）で原子的。
   */
  async createRecord(key: string, dto: CreateCustomRecordDto) {
    const record = await this.repo.createRecordAtomic(key, dto.data, (objectType, fieldDefs) => {
      if (!objectType) throw new NotFoundException('ObjectType not found');
      if (objectType.isPreset)
        throw new ForbiddenException('Preset ObjectType cannot write records');
      validateCustomRecordData(fieldDefs, dto.data);
    });
    return ok(toCustomRecordResponse(record));
  }

  /**
   * 自由定義データを更新する（ref-0098・data 全置換）。対象 CustomRecord が指定の ObjectType に
   * 属さない（または存在しない）場合は 404。FieldDef 正本検証・プリセット禁止・Serializable 境界を適用。
   */
  async updateRecord(key: string, id: number, dto: UpdateCustomRecordDto) {
    const record = await this.repo.updateRecordAtomic(
      key,
      id,
      dto.data,
      (objectType, fieldDefs, record) => {
        if (!objectType) throw new NotFoundException('ObjectType not found');
        if (objectType.isPreset)
          throw new ForbiddenException('Preset ObjectType cannot write records');
        if (!record) throw new NotFoundException('CustomRecord not found');
        if (record.objectTypeId !== objectType.id)
          throw new NotFoundException('CustomRecord not found');
        validateCustomRecordData(fieldDefs, dto.data);
      },
    );
    return ok(toCustomRecordResponse(record));
  }

  /**
   * 自由定義データを削除する（ref-0098）。対象 CustomRecord が指定の ObjectType に属さない
   * （または存在しない）場合は 404。プリセット ObjectType は拒否。Serializable 境界を適用。
   */
  async deleteRecord(key: string, id: number) {
    await this.repo.deleteRecordAtomic(key, id, (objectType, record) => {
      if (!objectType) throw new NotFoundException('ObjectType not found');
      if (objectType.isPreset)
        throw new ForbiddenException('Preset ObjectType cannot delete records');
      if (!record) throw new NotFoundException('CustomRecord not found');
      if (record.objectTypeId !== objectType.id)
        throw new NotFoundException('CustomRecord not found');
    });
    return okMessage('CustomRecord deleted');
  }
}
