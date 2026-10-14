-- CreateTable
CREATE TABLE "user_table_column_widths" (
    "user_id" TEXT NOT NULL,
    "table_id" TEXT NOT NULL,
    "column_key" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_table_column_widths_pkey" PRIMARY KEY ("user_id","table_id","column_key")
);

-- CreateIndex
CREATE INDEX "user_table_column_widths_user_id_table_id_idx" ON "user_table_column_widths"("user_id", "table_id");

-- AddForeignKey
ALTER TABLE "user_table_column_widths" ADD CONSTRAINT "user_table_column_widths_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
