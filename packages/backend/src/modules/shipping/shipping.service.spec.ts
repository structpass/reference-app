import { Test, TestingModule } from '@nestjs/testing';
import { ShippingService } from './shipping.service';
import { ShippingRepository } from './repositories/shipping.repository';

const mockReceiving = {
  id: 1,
  receivingNo: 'RCV-20260316-0001',
  receivingDate: new Date('2026-03-16'),
  status: 'CONFIRMED',
  createdAt: new Date('2026-03-16'),
  warehouse: { name: '倉庫A' },
  supplier: { name: 'テスト仕入先' },
};

const mockShipment = {
  id: 1,
  shipmentNo: 'SHP-20260316-0001',
  shipmentDate: new Date('2026-03-16'),
  destination: 'テスト配送先',
  status: 'CONFIRMED',
  createdAt: new Date('2026-03-16'),
  warehouse: { name: '倉庫A' },
};

const mockRepo = {
  findReceivings: jest.fn(),
  findShipments: jest.fn(),
};

describe('ShippingService', () => {
  let service: ShippingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ShippingService, { provide: ShippingRepository, useValue: mockRepo }],
    }).compile();

    service = module.get<ShippingService>(ShippingService);
    jest.clearAllMocks();
  });

  it('サービスが定義されていること', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('入荷と出荷を統合してShippingRecord shape を返すこと', async () => {
      mockRepo.findReceivings.mockResolvedValue([mockReceiving]);
      mockRepo.findShipments.mockResolvedValue([mockShipment]);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.success).toBe(true);
      expect(result.data.length).toBe(2);

      const receiving = result.data.find((r) => r.type === 'RECEIVING');
      expect(receiving).toBeDefined();
      expect(receiving).toHaveProperty('type', 'RECEIVING');
      expect(receiving).toHaveProperty('id', 1);
      expect(receiving).toHaveProperty('documentNo', 'RCV-20260316-0001');
      expect(receiving).toHaveProperty('warehouseName', '倉庫A');
      expect(receiving).toHaveProperty('counterparty', 'テスト仕入先');
      expect(receiving).toHaveProperty('status', 'CONFIRMED');
      expect(receiving).toHaveProperty('date');
      expect(receiving).toHaveProperty('createdAt');

      const shipment = result.data.find((r) => r.type === 'SHIPMENT');
      expect(shipment).toBeDefined();
      expect(shipment).toHaveProperty('type', 'SHIPMENT');
      expect(shipment).toHaveProperty('documentNo', 'SHP-20260316-0001');
      expect(shipment).toHaveProperty('warehouseName', '倉庫A');
      expect(shipment).toHaveProperty('counterparty', 'テスト配送先');
      expect(shipment).toHaveProperty('status', 'CONFIRMED');
    });

    it('入荷のみフィルタリングすること', async () => {
      mockRepo.findReceivings.mockResolvedValue([mockReceiving]);

      const result = await service.findAll({ type: 'RECEIVING' as never });

      expect(result.data.every((r) => r.type === 'RECEIVING')).toBe(true);
      expect(mockRepo.findShipments).not.toHaveBeenCalled();
    });

    it('出荷のみフィルタリングすること', async () => {
      mockRepo.findShipments.mockResolvedValue([mockShipment]);

      const result = await service.findAll({ type: 'SHIPMENT' as never });

      expect(result.data.every((r) => r.type === 'SHIPMENT')).toBe(true);
      expect(mockRepo.findReceivings).not.toHaveBeenCalled();
    });

    it('ページネーションが機能すること', async () => {
      mockRepo.findReceivings.mockResolvedValue([mockReceiving]);
      mockRepo.findShipments.mockResolvedValue([mockShipment]);

      const result = await service.findAll({ page: 1, limit: 1 });

      expect(result.data.length).toBe(1);
      expect(result.meta.total).toBe(2);
    });

    it('日付でソートすること', async () => {
      const earlyReceiving = {
        ...mockReceiving,
        receivingDate: new Date('2026-03-15'),
        createdAt: new Date('2026-03-15'),
      };
      const lateShipment = {
        ...mockShipment,
        shipmentDate: new Date('2026-03-17'),
        createdAt: new Date('2026-03-17'),
      };

      mockRepo.findReceivings.mockResolvedValue([earlyReceiving]);
      mockRepo.findShipments.mockResolvedValue([lateShipment]);

      const result = await service.findAll({ sort: 'date', order: 'asc' });

      expect(result.data[0].type).toBe('RECEIVING');
      expect(result.data[1].type).toBe('SHIPMENT');
    });

    it('search/warehouseId を Repository に伝搬すること', async () => {
      mockRepo.findReceivings.mockResolvedValue([]);
      mockRepo.findShipments.mockResolvedValue([]);

      await service.findAll({ search: 'RCV', warehouseId: 5 });

      expect(mockRepo.findReceivings).toHaveBeenCalledWith({ search: 'RCV', warehouseId: 5 });
      expect(mockRepo.findShipments).toHaveBeenCalledWith({ search: 'RCV', warehouseId: 5 });
    });
  });

  describe('findAllForExport', () => {
    it('全レコードを返すこと', async () => {
      mockRepo.findReceivings.mockResolvedValue([mockReceiving]);
      mockRepo.findShipments.mockResolvedValue([mockShipment]);

      const result = await service.findAllForExport({});

      expect(result.length).toBe(2);
    });
  });
});
