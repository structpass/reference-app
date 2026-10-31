-- Phase 6: Add warehouse management tables and migrate user roles

-- CreateEnum
CREATE TYPE "ActiveStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ReceivingStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'SHIPPED');

-- CreateEnum
CREATE TYPE "StocktakingStatus" AS ENUM ('DRAFT', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AdjustmentType" AS ENUM ('STOCKTAKING', 'RECEIVING', 'SHIPMENT', 'MANUAL');

-- AlterEnum: Migrate UserRole with data conversion using CASE in USING clause
CREATE TYPE "UserRole_new" AS ENUM ('WH_USER', 'WH_ADMIN', 'OF_USER', 'OF_ADMIN', 'SYS_ADMIN');
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "UserRole_new"
  USING (
    CASE "role"::text
      WHEN 'ADMIN' THEN 'SYS_ADMIN'
      WHEN 'USER' THEN 'OF_USER'
      ELSE "role"::text
    END
  )::"UserRole_new";
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "UserRole_old";
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'WH_USER';

-- AlterTable: Add new columns to existing tables
ALTER TABLE "products" ADD COLUMN "purchase_price" DECIMAL(10,2),
ADD COLUMN "unit" TEXT;

ALTER TABLE "users" ADD COLUMN "last_login_at" TIMESTAMP(3);

-- CreateTable: warehouses
CREATE TABLE "warehouses" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "manager" TEXT,
    "capacity" INTEGER,
    "status" "ActiveStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable: carriers
CREATE TABLE "carriers" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "contact_person" TEXT,
    "email" TEXT,
    "status" "ActiveStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "carriers_pkey" PRIMARY KEY ("id")
);

-- CreateTable: groups
CREATE TABLE "groups" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ActiveStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable: user_groups
CREATE TABLE "user_groups" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "group_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable: permissions
CREATE TABLE "permissions" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT,
    "group_id" INTEGER,
    "feature_id" TEXT NOT NULL,
    "can_view" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: receivings
CREATE TABLE "receivings" (
    "id" SERIAL NOT NULL,
    "receiving_no" TEXT NOT NULL,
    "receiving_date" DATE NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "supplier" TEXT NOT NULL,
    "status" "ReceivingStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "receivings_pkey" PRIMARY KEY ("id")
);

-- CreateTable: receiving_lines
CREATE TABLE "receiving_lines" (
    "id" SERIAL NOT NULL,
    "receiving_id" INTEGER NOT NULL,
    "line_no" INTEGER NOT NULL,
    "product_id" TEXT NOT NULL,
    "planned_qty" INTEGER NOT NULL,
    "actual_qty" INTEGER,
    CONSTRAINT "receiving_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable: shipments
CREATE TABLE "shipments" (
    "id" SERIAL NOT NULL,
    "shipment_no" TEXT NOT NULL,
    "shipment_date" DATE NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "destination" TEXT NOT NULL,
    "carrier_id" INTEGER,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable: shipment_lines
CREATE TABLE "shipment_lines" (
    "id" SERIAL NOT NULL,
    "shipment_id" INTEGER NOT NULL,
    "line_no" INTEGER NOT NULL,
    "product_id" TEXT NOT NULL,
    "planned_qty" INTEGER NOT NULL,
    "actual_qty" INTEGER,
    CONSTRAINT "shipment_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable: stocks
CREATE TABLE "stocks" (
    "id" SERIAL NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable: stocktakings
CREATE TABLE "stocktakings" (
    "id" SERIAL NOT NULL,
    "stocktaking_date" DATE NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "stocktaker" TEXT,
    "status" "StocktakingStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "stocktakings_pkey" PRIMARY KEY ("id")
);

-- CreateTable: stocktaking_items
CREATE TABLE "stocktaking_items" (
    "id" SERIAL NOT NULL,
    "stocktaking_id" INTEGER NOT NULL,
    "product_id" TEXT NOT NULL,
    "theoretical_qty" INTEGER NOT NULL,
    "actual_qty" INTEGER,
    "difference" INTEGER,
    "difference_reason" TEXT,
    CONSTRAINT "stocktaking_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable: stock_adjustments
CREATE TABLE "stock_adjustments" (
    "id" SERIAL NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "product_id" TEXT NOT NULL,
    "adjustment_type" "AdjustmentType" NOT NULL,
    "quantity_before" INTEGER NOT NULL,
    "quantity_after" INTEGER NOT NULL,
    "reason" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable: orders
CREATE TABLE "orders" (
    "id" SERIAL NOT NULL,
    "order_no" TEXT NOT NULL,
    "order_date" DATE NOT NULL,
    "supplier" TEXT NOT NULL,
    "desired_delivery_date" DATE,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "total_qty" INTEGER,
    "total_amount" DECIMAL(12,2),
    "created_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable: order_items
CREATE TABLE "order_items" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "line_no" INTEGER NOT NULL,
    "product_id" TEXT NOT NULL,
    "order_qty" INTEGER NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_code_key" ON "warehouses"("code");
CREATE UNIQUE INDEX "carriers_code_key" ON "carriers"("code");
CREATE UNIQUE INDEX "groups_code_key" ON "groups"("code");
CREATE UNIQUE INDEX "user_groups_user_id_group_id_key" ON "user_groups"("user_id", "group_id");
CREATE INDEX "permissions_user_id_idx" ON "permissions"("user_id");
CREATE INDEX "permissions_group_id_idx" ON "permissions"("group_id");
CREATE INDEX "permissions_feature_id_idx" ON "permissions"("feature_id");
CREATE UNIQUE INDEX "receivings_receiving_no_key" ON "receivings"("receiving_no");
CREATE UNIQUE INDEX "receiving_lines_receiving_id_line_no_key" ON "receiving_lines"("receiving_id", "line_no");
CREATE UNIQUE INDEX "shipments_shipment_no_key" ON "shipments"("shipment_no");
CREATE UNIQUE INDEX "shipment_lines_shipment_id_line_no_key" ON "shipment_lines"("shipment_id", "line_no");
CREATE UNIQUE INDEX "stocks_warehouse_id_product_id_key" ON "stocks"("warehouse_id", "product_id");
CREATE UNIQUE INDEX "stocktaking_items_stocktaking_id_product_id_key" ON "stocktaking_items"("stocktaking_id", "product_id");
CREATE UNIQUE INDEX "orders_order_no_key" ON "orders"("order_no");
CREATE UNIQUE INDEX "order_items_order_id_line_no_key" ON "order_items"("order_id", "line_no");

-- AddForeignKey
ALTER TABLE "user_groups" ADD CONSTRAINT "user_groups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_groups" ADD CONSTRAINT "user_groups_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "receivings" ADD CONSTRAINT "receivings_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receivings" ADD CONSTRAINT "receivings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receiving_lines" ADD CONSTRAINT "receiving_lines_receiving_id_fkey" FOREIGN KEY ("receiving_id") REFERENCES "receivings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "receiving_lines" ADD CONSTRAINT "receiving_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_carrier_id_fkey" FOREIGN KEY ("carrier_id") REFERENCES "carriers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shipment_lines" ADD CONSTRAINT "shipment_lines_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shipment_lines" ADD CONSTRAINT "shipment_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stocks" ADD CONSTRAINT "stocks_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stocks" ADD CONSTRAINT "stocks_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stocktakings" ADD CONSTRAINT "stocktakings_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stocktakings" ADD CONSTRAINT "stocktakings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stocktaking_items" ADD CONSTRAINT "stocktaking_items_stocktaking_id_fkey" FOREIGN KEY ("stocktaking_id") REFERENCES "stocktakings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stocktaking_items" ADD CONSTRAINT "stocktaking_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
