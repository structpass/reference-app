-- CreateTable
CREATE TABLE "table_pagination_settings" (
    "table_id" TEXT NOT NULL,
    "default_page_size" INTEGER NOT NULL,
    "page_size_options" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_id" TEXT,

    CONSTRAINT "table_pagination_settings_pkey" PRIMARY KEY ("table_id")
);

-- AddForeignKey
ALTER TABLE "table_pagination_settings" ADD CONSTRAINT "table_pagination_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
