import { Test, TestingModule } from '@nestjs/testing';
import { DocumentNumberService } from './document-number.service';
import { PrismaService } from '../../database/prisma.service';

const mockPrismaService = {
  receiving: { findFirst: jest.fn() },
  shipment: { findFirst: jest.fn() },
  order: { findFirst: jest.fn() },
};

describe('DocumentNumberService', () => {
  let service: DocumentNumberService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DocumentNumberService, { provide: PrismaService, useValue: mockPrismaService }],
    }).compile();

    service = module.get<DocumentNumberService>(DocumentNumberService);
    jest.clearAllMocks();
  });

  it('サービスが定義されていること', () => {
    expect(service).toBeDefined();
  });

  describe('generateReceivingNo', () => {
    it('既存がない場合に連番0001から始まること', async () => {
      mockPrismaService.receiving.findFirst.mockResolvedValue(null);

      const result = await service.generateReceivingNo();

      expect(result).toMatch(/^RCV-\d{8}-0001$/);
    });

    it('既存がある場合に連番をインクリメントすること', async () => {
      const today = new Date();
      const dateStr = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, '0'),
        String(today.getDate()).padStart(2, '0'),
      ].join('');

      mockPrismaService.receiving.findFirst.mockResolvedValue({
        receivingNo: `RCV-${dateStr}-0005`,
      });

      const result = await service.generateReceivingNo();

      expect(result).toBe(`RCV-${dateStr}-0006`);
    });
  });

  describe('generateShipmentNo', () => {
    it('既存がない場合に連番0001から始まること', async () => {
      mockPrismaService.shipment.findFirst.mockResolvedValue(null);

      const result = await service.generateShipmentNo();

      expect(result).toMatch(/^SHP-\d{8}-0001$/);
    });

    it('既存がある場合に連番をインクリメントすること', async () => {
      const today = new Date();
      const dateStr = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, '0'),
        String(today.getDate()).padStart(2, '0'),
      ].join('');

      mockPrismaService.shipment.findFirst.mockResolvedValue({
        shipmentNo: `SHP-${dateStr}-0003`,
      });

      const result = await service.generateShipmentNo();

      expect(result).toBe(`SHP-${dateStr}-0004`);
    });
  });

  describe('generateOrderNo', () => {
    it('既存がない場合に連番001から始まること', async () => {
      mockPrismaService.order.findFirst.mockResolvedValue(null);

      const result = await service.generateOrderNo();

      expect(result).toMatch(/^PO-\d{8}-001$/);
    });

    it('既存がある場合に連番をインクリメントすること', async () => {
      const today = new Date();
      const dateStr = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, '0'),
        String(today.getDate()).padStart(2, '0'),
      ].join('');

      mockPrismaService.order.findFirst.mockResolvedValue({
        orderNo: `PO-${dateStr}-010`,
      });

      const result = await service.generateOrderNo();

      expect(result).toBe(`PO-${dateStr}-011`);
    });
  });
});
