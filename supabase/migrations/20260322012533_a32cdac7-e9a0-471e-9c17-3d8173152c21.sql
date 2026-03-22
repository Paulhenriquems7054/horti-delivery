
-- Allow public INSERT, UPDATE, DELETE on products
CREATE POLICY "Anyone can insert products" ON public.products FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update products" ON public.products FOR UPDATE TO public USING (true);
CREATE POLICY "Anyone can delete products" ON public.products FOR DELETE TO public USING (true);

-- Allow public INSERT, UPDATE, DELETE on baskets
CREATE POLICY "Anyone can insert baskets" ON public.baskets FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update baskets" ON public.baskets FOR UPDATE TO public USING (true);
CREATE POLICY "Anyone can delete baskets" ON public.baskets FOR DELETE TO public USING (true);

-- Allow public INSERT, UPDATE, DELETE on basket_items
CREATE POLICY "Anyone can insert basket_items" ON public.basket_items FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update basket_items" ON public.basket_items FOR UPDATE TO public USING (true);
CREATE POLICY "Anyone can delete basket_items" ON public.basket_items FOR DELETE TO public USING (true);
