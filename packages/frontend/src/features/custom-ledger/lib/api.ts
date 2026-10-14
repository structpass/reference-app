import { AxiosError } from 'axios';
import apiClient from '@/lib/api-client';
import type { PaginationMeta } from '@struct-pass/shared';

/** 項目定義（ref-0076 の findByKey レスポンス）。 */
export interface FieldDefResponse {
  id: number;
  objectTypeId: number;
  key: string;
  label: string;
  type: 'TEXT' | 'NUMBER' | 'DATE' | 'SELECT' | 'BOOLEAN';
  required: boolean;
  sortOrder: number;
}

/** 台帳（種別）1 件（ref-0076・findByKey）。 */
export interface ObjectTypeResponse {
  id: number;
  key: string;
  name: string;
  icon: string | null;
  sortOrder: number;
  isPreset: boolean;
  fieldDefs?: FieldDefResponse[];
  createdAt: string;
  updatedAt: string;
}

/** 台帳新規作成の payload（ref-0096・backend CreateObjectTypeDto）。 */
export interface CreateObjectTypePayload {
  key: string;
  name: string;
  icon?: string;
  sortOrder?: number;
  fieldDefs: Array<{
    key: string;
    label: string;
    type: 'TEXT' | 'NUMBER' | 'DATE' | 'SELECT' | 'BOOLEAN';
    required?: boolean;
  }>;
}

/** 台帳更新の payload（ref-0097・backend UpdateObjectTypeDto・key は不変で body に含めない）。 */
export type UpdateObjectTypePayload = Omit<CreateObjectTypePayload, 'key' | 'icon'> & {
  /** null で任意アイコンを解除する。 */
  icon?: string | null;
};

/** 自由定義データ 1 件（ref-0076・findRecords）。 */
export interface CustomRecordResponse {
  id: number;
  objectTypeId: number;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** 自由定義データの作成 payload（ref-0098・backend CreateCustomRecordDto）。 */
export interface CreateCustomRecordPayload {
  data: Record<string, unknown>;
}

/** 自由定義データの更新 payload（ref-0098・backend UpdateCustomRecordDto）。 */
export type UpdateCustomRecordPayload = CreateCustomRecordPayload;

interface MessageResponse {
  data: { message: string };
}

const objectTypePath = (key: string) => `/object-types/${encodeURIComponent(key)}`;

/**
 * 台帳一覧をstrictに取得する。呼び出し側がcatalog取得失敗と有効な空配列を区別するため、
 * HTTPエラーと不正なresponse shapeはそのままthrowする。
 */
export async function fetchObjectTypesStrict(): Promise<ObjectTypeResponse[]> {
  const res = await apiClient.get<{ data: ObjectTypeResponse[] }>('/object-types');
  if (!Array.isArray(res.data.data)) {
    throw new Error('Invalid ObjectType catalog response');
  }
  return res.data.data;
}

/** 台帳一覧（ref-0077 の左メニュー動的追加用）。失敗時は空配列へ倒す後方互換API。 */
export async function fetchObjectTypes(): Promise<ObjectTypeResponse[]> {
  try {
    return await fetchObjectTypesStrict();
  } catch {
    return [];
  }
}

/** 台帳を新規作成する（ref-0096・backend POST /object-types）。成功時は作成された台帳を返す。 */
export async function createObjectType(
  payload: CreateObjectTypePayload,
): Promise<ObjectTypeResponse> {
  const res = await apiClient.post<{ data: ObjectTypeResponse }>(`/object-types`, payload);
  return res.data.data;
}

/** 台帳を更新する（ref-0097・backend PUT /object-types/:key・key は不変）。成功時は更新された台帳を返す。 */
export async function updateObjectType(
  key: string,
  payload: UpdateObjectTypePayload,
): Promise<ObjectTypeResponse> {
  const res = await apiClient.put<{ data: ObjectTypeResponse }>(`/object-types/${key}`, payload);
  return res.data.data;
}

/** 台帳をキーで取得する（項目定義込み）。404 は null へ倒す。
 * 注: 404 以外（500・ネットワーク断・403）も null へ倒す＝「見つかりません」表示に含める
 * （ref-0078 criteria 5 は「toast を出さず静かに表示」を求めており、FeatureGuard + backend ガードが
 * 主経路を塞ぐため conflate しても実害は限定的）。 */
export async function fetchObjectTypeByKey(key: string): Promise<ObjectTypeResponse | null> {
  try {
    const res = await apiClient.get<{ data: ObjectTypeResponse }>(objectTypePath(key));
    return res.data.data;
  } catch {
    return null;
  }
}

/**
 * 一覧取得の戻り値。成功した 0 件と取得失敗を呼び出し側が区別できる形にする
 * （失敗を null へ畳んで空表示に倒すと、実データがあるのに「データがありません」と断定してしまう）。
 */
export type CustomRecordsResult =
  | { status: 'ok'; data: CustomRecordResponse[]; meta: PaginationMeta }
  | { status: 'error' };

/** 自由定義データの一覧をページング取得する。取得失敗は status='error' で返す（空表示へ倒さない）。 */
export async function fetchCustomRecords(
  key: string,
  page: number,
  limit = 50,
): Promise<CustomRecordsResult> {
  try {
    const res = await apiClient.get<{ data: CustomRecordResponse[]; meta: PaginationMeta }>(
      `${objectTypePath(key)}/records`,
      { params: { page, limit } },
    );
    return { status: 'ok', data: res.data.data, meta: res.data.meta };
  } catch {
    return { status: 'error' };
  }
}

/**
 * 単体取得の戻り値。404（レコード不在・別台帳の ID）と取得失敗を区別する。編集画面は
 * 「見つからない」と「読み込めない」で出す文言が変わるため、両者を畳まない。
 */
export type CustomRecordResult =
  | { status: 'ok'; record: CustomRecordResponse }
  | { status: 'not_found' }
  | { status: 'error' };

/**
 * 自由定義データを 1 件取得する（backend GET /object-types/:key/records/:id）。
 * 一覧のページ窓（skip/take）を経由しないので、2 ページ目以降のレコードでも直接 URL・
 * 再読み込みで取得できる。所属境界（別台帳の ID は 404）は backend 側で判定される。
 */
export async function fetchCustomRecord(
  key: string,
  id: number | string,
): Promise<CustomRecordResult> {
  try {
    const res = await apiClient.get<{ data: CustomRecordResponse }>(
      `${objectTypePath(key)}/records/${encodeURIComponent(String(id))}`,
    );
    return { status: 'ok', record: res.data.data };
  } catch (error) {
    if (error instanceof AxiosError && error.response?.status === 404) {
      return { status: 'not_found' };
    }
    return { status: 'error' };
  }
}

/** 自由定義データを作成する。成功時は作成されたレコードを返す。 */
export async function createCustomRecord(
  key: string,
  payload: CreateCustomRecordPayload,
): Promise<CustomRecordResponse> {
  const res = await apiClient.post<{ data: CustomRecordResponse }>(
    `${objectTypePath(key)}/records`,
    payload,
  );
  return res.data.data;
}

/** 自由定義データを更新する（data は完全置換）。 */
export async function updateCustomRecord(
  key: string,
  id: number | string,
  payload: UpdateCustomRecordPayload,
): Promise<CustomRecordResponse> {
  const res = await apiClient.put<{ data: CustomRecordResponse }>(
    `${objectTypePath(key)}/records/${encodeURIComponent(String(id))}`,
    payload,
  );
  return res.data.data;
}

/** 自由定義データを削除する。 */
export async function deleteCustomRecord(key: string, id: number | string): Promise<string> {
  const res = await apiClient.delete<MessageResponse>(
    `${objectTypePath(key)}/records/${encodeURIComponent(String(id))}`,
  );
  return res.data.data.message;
}
