import { Injectable } from '@nestjs/common';
import { ObjectType, CustomRecord, FieldDef, FieldType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { runInSerializableTransaction } from '../../../common/database/serializable-tx';

export interface CustomRecordPage {
  items: CustomRecord[];
  total: number;
}

export interface CreateObjectTypeData {
  key: string;
  name: string;
  icon: string | null;
  sortOrder: number;
  fieldDefs: Array<{
    key: string;
    label: string;
    type: FieldType;
    required: boolean;
    sortOrder: number;
  }>;
}

export type ObjectTypeWithFields = ObjectType & { fieldDefs: FieldDef[] };
export type UpdateObjectTypeData = Omit<CreateObjectTypeData, 'key'>;

@Injectable()
export class ObjectTypesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateObjectTypeData): Promise<ObjectType & { fieldDefs: FieldDef[] }> {
    return this.prisma.objectType.create({
      data: {
        key: data.key,
        name: data.name,
        icon: data.icon,
        sortOrder: data.sortOrder,
        isPreset: false,
        fieldDefs: { create: data.fieldDefs },
      },
      include: { fieldDefs: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  updateDefinitionAtomic(
    key: string,
    data: UpdateObjectTypeData,
    validate: (current: ObjectTypeWithFields | null, recordCount: number) => void,
  ): Promise<ObjectTypeWithFields> {
    return runInSerializableTransaction(this.prisma, async (tx) => {
      const current = await tx.objectType.findUnique({
        where: { key },
        include: { fieldDefs: { orderBy: { sortOrder: 'asc' } } },
      });
      const recordCount = current
        ? await tx.customRecord.count({ where: { objectTypeId: current.id } })
        : 0;
      validate(current, recordCount);
      return tx.objectType.update({
        where: { key },
        data: {
          name: data.name,
          icon: data.icon,
          sortOrder: data.sortOrder,
          fieldDefs: {
            deleteMany: {},
            create: data.fieldDefs,
          },
        },
        include: { fieldDefs: { orderBy: { sortOrder: 'asc' } } },
      });
    });
  }

  findAll(): Promise<ObjectType[]> {
    return this.prisma.objectType.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  /** 種別 1 件を取得する。ref-0076: findByKey のみ項目定義（fieldDefs・sortOrder asc）を include する。 */
  findByKey(key: string): Promise<(ObjectType & { fieldDefs: FieldDef[] }) | null> {
    return this.prisma.objectType.findUnique({
      where: { key },
      include: { fieldDefs: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  /** 種別 1 件を素の形（include なし）で取得する。ref-0076: findRecords の存在確認・isPreset 判定専用
   * （項目定義の全件取得を伴わない軽量経路。system-settings.repository の findByKeyBare と同型）。 */
  findByKeyBare(key: string): Promise<ObjectType | null> {
    return this.prisma.objectType.findUnique({ where: { key } });
  }

  // TODO(ref-0013 Phase 2): CustomRecord の objectTypeId 参照解決で使用予定。
  // Phase 1 では read 経路（findAll / findByKey）のみ配線し、id 引きは土台として先行配置している。
  findById(id: number): Promise<ObjectType | null> {
    return this.prisma.objectType.findUnique({ where: { id } });
  }

  /** 種別に紐づく自由定義データをページング取得する（ref-0076）。並びは id asc で安定させる。 */
  async findRecords(objectTypeId: number, page: number, limit: number): Promise<CustomRecordPage> {
    const where: Prisma.CustomRecordWhereInput = { objectTypeId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.customRecord.findMany({
        where,
        orderBy: { id: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.customRecord.count({ where }),
    ]);
    return { items, total };
  }

  /**
   * 種別に属する自由定義データ 1 件を取得する。更新・削除（ref-0098）と同じ
   * `{ id, objectTypeId }` スコープで引き、別の ObjectType に属する id・存在しない id は
   * null になる（存在を露出しない）。1 ページの窓（skip/take）に依存しない単体取得の経路。
   */
  findRecordInObjectType(objectTypeId: number, id: number): Promise<CustomRecord | null> {
    return this.prisma.customRecord.findFirst({ where: { id, objectTypeId } });
  }

  /**
   * CustomRecord を作成する（ref-0098）。Serializable tx 内で ObjectType+FieldDef を
   * fresh read し、validateFn で検証してから書込む。定義更新（ref-0097）と同一の
   * 整合性境界 ＝ stale FieldDef に対して検証して書く事故を防ぐ。
   */
  createRecordAtomic(
    key: string,
    data: Record<string, unknown>,
    validate: (objectType: ObjectType | null, fieldDefs: FieldDef[]) => void,
  ): Promise<CustomRecord> {
    return runInSerializableTransaction(this.prisma, async (tx) => {
      const objectType = await tx.objectType.findUnique({ where: { key } });
      const fieldDefs = objectType
        ? await tx.fieldDef.findMany({ where: { objectTypeId: objectType.id } })
        : [];
      validate(objectType, fieldDefs);
      if (!objectType) {
        // validate で NotFound を投げる想定だが、型上ここに来た場合は例外を強制する。
        throw new Error('unreachable: objectType must be validated before create');
      }
      return tx.customRecord.create({
        data: { objectTypeId: objectType.id, data: data as Prisma.InputJsonValue },
      });
    });
  }

  /**
   * CustomRecord を更新する（ref-0098・data 全置換）。Serializable tx 内で
   * ObjectType+FieldDef+対象レコードを fresh read し、validateFn で検証してから書込む。
   * 対象は { id, objectTypeId } で型スコープする（別 ObjectType に属するものを 404）。
   */
  updateRecordAtomic(
    key: string,
    id: number,
    data: Record<string, unknown>,
    validate: (
      objectType: ObjectType | null,
      fieldDefs: FieldDef[],
      record: CustomRecord | null,
    ) => void,
  ): Promise<CustomRecord> {
    return runInSerializableTransaction(this.prisma, async (tx) => {
      const objectType = await tx.objectType.findUnique({ where: { key } });
      const fieldDefs = objectType
        ? await tx.fieldDef.findMany({ where: { objectTypeId: objectType.id } })
        : [];
      const record = objectType ? await tx.customRecord.findUnique({ where: { id } }) : null;
      validate(objectType, fieldDefs, record);
      if (!objectType || !record) {
        throw new Error('unreachable: objectType/record must be validated before update');
      }
      if (record.objectTypeId !== objectType.id) {
        throw new Error('unreachable: record must belong to objectType');
      }
      return tx.customRecord.update({
        where: { id },
        data: { data: data as Prisma.InputJsonValue },
      });
    });
  }

  /**
   * CustomRecord を削除する（ref-0098）。Serializable tx 内で ObjectType+対象レコードを
   * fresh read し、validateFn で検証してから削除する。対象は { id, objectTypeId } で型スコープ。
   */
  deleteRecordAtomic(
    key: string,
    id: number,
    validate: (objectType: ObjectType | null, record: CustomRecord | null) => void,
  ): Promise<CustomRecord> {
    return runInSerializableTransaction(this.prisma, async (tx) => {
      const objectType = await tx.objectType.findUnique({ where: { key } });
      const record = objectType ? await tx.customRecord.findUnique({ where: { id } }) : null;
      validate(objectType, record);
      if (!objectType || !record) {
        throw new Error('unreachable: objectType/record must be validated before delete');
      }
      if (record.objectTypeId !== objectType.id) {
        throw new Error('unreachable: record must belong to objectType');
      }
      return tx.customRecord.delete({ where: { id } });
    });
  }
}
