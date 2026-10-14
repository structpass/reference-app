-- CreateTable
CREATE TABLE "categories" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ActiveStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_code_key" ON "categories"("code");

-- Step 1: Insert unique categories from existing product data
INSERT INTO "categories" ("code", "name", "status", "updated_at")
SELECT
    'CAT-' || LPAD(ROW_NUMBER() OVER (ORDER BY "category")::TEXT, 3, '0'),
    "category",
    'ACTIVE',
    CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "category" FROM "products" WHERE "category" IS NOT NULL) AS cats;

-- Step 2: Add category_id column (nullable first)
ALTER TABLE "products" ADD COLUMN "category_id" INTEGER;

-- Step 3: Populate category_id from existing category text
UPDATE "products" p
SET "category_id" = c."id"
FROM "categories" c
WHERE p."category" = c."name";

-- Step 4: Make category_id NOT NULL
ALTER TABLE "products" ALTER COLUMN "category_id" SET NOT NULL;

-- Step 5: Drop the old category text column
ALTER TABLE "products" DROP COLUMN "category";

-- Step 6: Add foreign key constraint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
