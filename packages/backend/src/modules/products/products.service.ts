import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ok, okMessage } from '../../common/dto';
import { ProductsRepository } from './repositories/products.repository';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { FindProductsDto } from './dto/find-products.dto';
import { toProductResponse } from './products.mapper';

@Injectable()
export class ProductsService {
  constructor(private readonly repo: ProductsRepository) {}

  async findAll(query: FindProductsDto) {
    return this.repo.findManyPaginated(query);
  }

  async findOne(id: string) {
    const product = await this.repo.findByIdWithRelations(id);

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return ok(toProductResponse(product));
  }

  async create(dto: CreateProductDto, userId: string) {
    const existing = await this.repo.findByCode(dto.code);
    if (existing) {
      throw new ConflictException(`Product with code ${dto.code} already exists`);
    }

    const { price, purchasePrice, categoryId, ...rest } = dto;
    const product = await this.repo.create({
      ...rest,
      price: new Prisma.Decimal(price),
      // `purchasePrice` は nullable 列。`null`（未指定・クリア）は Decimal へ通さず
      // 未設定のまま作る（`new Prisma.Decimal(null)` は DecimalError で 500 になる。v2-456）。
      ...(typeof purchasePrice === 'number' && {
        purchasePrice: new Prisma.Decimal(purchasePrice),
      }),
      category: { connect: { id: categoryId } },
      creator: { connect: { id: userId } },
    });

    return ok(toProductResponse(product));
  }

  async update(id: string, dto: UpdateProductDto, userId: string) {
    const existing = await this.repo.findById(id);

    if (!existing) {
      throw new NotFoundException('Product not found');
    }

    if (dto.code && dto.code !== existing.code) {
      const codeExists = await this.repo.findByCode(dto.code);
      if (codeExists) {
        throw new ConflictException(`Product with code ${dto.code} already exists`);
      }
    }

    const { price, purchasePrice, categoryId, ...rest } = dto;
    const data: Prisma.ProductUpdateInput = {
      ...rest,
      updater: { connect: { id: userId } },
    };

    if (categoryId !== undefined) {
      data.category = { connect: { id: categoryId } };
    }
    if (price !== undefined) {
      data.price = new Prisma.Decimal(price);
    }
    // `purchasePrice` は nullable 列なので `null` は「クリア」として明示送出する。
    // Decimal へは数値の時だけ通す（`new Prisma.Decimal(null)` は DecimalError で 500。v2-456）。
    if (purchasePrice !== undefined) {
      data.purchasePrice =
        typeof purchasePrice === 'number' ? new Prisma.Decimal(purchasePrice) : null;
    }

    const product = await this.repo.update(id, data);
    return ok(toProductResponse(product));
  }

  async remove(id: string) {
    const existing = await this.repo.findById(id);

    if (!existing) {
      throw new NotFoundException('Product not found');
    }

    await this.repo.delete(id);

    return okMessage('Product deleted successfully');
  }

  async findAllForExport(query: FindProductsDto) {
    return this.repo.findManyForExport(query);
  }
}
