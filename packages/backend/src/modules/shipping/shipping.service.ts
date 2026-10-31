import { Injectable } from '@nestjs/common';
import { okPaginated, buildPaginatedMeta } from '../../common/dto';
import { ShippingRepository } from './repositories/shipping.repository';
import { FindShippingDto, ShippingType } from './dto/find-shipping.dto';
import { ShippingRecord } from './dto/shipping-response.dto';

/** エクスポート時に一括取得する最大行数（ページング上限の代替）。 */
const MAX_EXPORT_ROWS = 10000;

@Injectable()
export class ShippingService {
  constructor(private readonly repo: ShippingRepository) {}

  async findAll(query: FindShippingDto) {
    const {
      page = 1,
      limit = 20,
      sort = 'createdAt',
      order = 'desc',
      search,
      type,
      warehouseId,
    } = query;

    const records: ShippingRecord[] = [];

    if (!type || type === ShippingType.RECEIVING) {
      const receivings = await this.repo.findReceivings({ search, warehouseId });
      for (const r of receivings) {
        records.push({
          type: 'RECEIVING',
          id: r.id,
          documentNo: r.receivingNo,
          date: r.receivingDate,
          warehouseName: r.warehouse.name,
          counterparty: r.supplier.name,
          status: r.status,
          createdAt: r.createdAt,
        });
      }
    }

    if (!type || type === ShippingType.SHIPMENT) {
      const shipments = await this.repo.findShipments({ search, warehouseId });
      for (const s of shipments) {
        records.push({
          type: 'SHIPMENT',
          id: s.id,
          documentNo: s.shipmentNo,
          date: s.shipmentDate,
          warehouseName: s.warehouse.name,
          counterparty: s.destination,
          status: s.status,
          createdAt: s.createdAt,
        });
      }
    }

    const sortKey = sort === 'date' ? 'date' : 'createdAt';
    records.sort((a, b) => {
      const cmp = new Date(a[sortKey]).getTime() - new Date(b[sortKey]).getTime();
      return order === 'desc' ? -cmp : cmp;
    });

    const total = records.length;
    const start = (page - 1) * limit;
    const data = records.slice(start, start + limit);

    return okPaginated(data, buildPaginatedMeta(total, page, limit));
  }

  async findAllForExport(query: FindShippingDto): Promise<ShippingRecord[]> {
    const result = await this.findAll({ ...query, page: 1, limit: MAX_EXPORT_ROWS });
    return result.data;
  }
}
