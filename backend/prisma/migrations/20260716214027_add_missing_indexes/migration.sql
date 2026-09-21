-- CreateIndex
CREATE INDEX "order_item_extras_order_item_id_idx" ON "order_item_extras"("order_item_id");

-- CreateIndex
CREATE INDEX "order_item_extras_menu_item_id_idx" ON "order_item_extras"("menu_item_id");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_menu_item_id_idx" ON "order_items"("menu_item_id");

-- CreateIndex
CREATE INDEX "orders_status_created_at_idx" ON "orders"("status", "created_at");

-- CreateIndex
CREATE INDEX "orders_assigned_to_id_idx" ON "orders"("assigned_to_id");

-- CreateIndex
CREATE INDEX "orders_neighborhood_id_idx" ON "orders"("neighborhood_id");

-- CreateIndex
CREATE INDEX "orders_created_by_id_idx" ON "orders"("created_by_id");
