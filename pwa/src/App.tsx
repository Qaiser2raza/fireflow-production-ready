import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MenuPage } from './pages/MenuPage';
import { CartPage } from './pages/CartPage';
import { ConfirmationPage } from './pages/ConfirmationPage';

export const App: React.FC = () => {
  const [cart, setCart] = useState<Record<string, any>>({});

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MenuPage cart={cart} setCart={setCart} />} />
        <Route path="/cart" element={<CartPage cart={cart} setCart={setCart} />} />
        <Route path="/confirmation" element={<ConfirmationPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
