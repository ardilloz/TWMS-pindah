import { Routes, Route } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { Guard } from "@/components/Guard";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import BarangMasuk from "@/pages/BarangMasuk";
import BarangKeluar from "@/pages/BarangKeluar";
import Riwayat from "@/pages/Riwayat";
import Gudang from "@/pages/Gudang";
import SupplierPage from "@/pages/SupplierPage";
import Pengguna from "@/pages/Pengguna";
import MasterData from "@/pages/MasterData";
import Asisten from "@/pages/Asisten";
import InternalLayout from "@/pages/internal/InternalLayout";
import InternalDashboard from "@/pages/internal/Dashboard";
import Harga from "@/pages/internal/Harga";
import BandulPage from "@/pages/internal/Bandul";
import Pembelian from "@/pages/internal/Pembelian";
import BeratKoli from "@/pages/internal/BeratKoli";
import Penjualan from "@/pages/internal/Penjualan";
import Busai from "@/pages/internal/Busai";
import Kasir from "@/pages/internal/Kasir";
import DetailKoli from "@/pages/internal/DetailKoli";
import LaporanPenjualan from "@/pages/internal/LaporanPenjualan";
import DetailKoliCC from "@/pages/internal/DetailKoliCC";
import SisaStock from "@/pages/internal/SisaStock";
import Out from "@/pages/internal/Out";
import Revisi from "@/pages/internal/Revisi";
import type { Permission } from "@/lib/types";

const P_STOK: Permission[] = ["stok"];
const P_MASUK: Permission[] = ["masuk"];
const P_KELUAR: Permission[] = ["transfer", "pribadi"];
const P_RIWAYAT: Permission[] = ["riwayat"];
const P_GUDANG: Permission[] = ["gudang"];
const P_SUPPLIER: Permission[] = ["supplier"];

const home = (
  <Guard any={P_STOK}>
    <Dashboard />
  </Guard>
);

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.tsx.
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<AppLayout />}>
        <Route path="/" element={home} />
        <Route path="/barang-masuk" element={<Guard any={P_MASUK}><BarangMasuk /></Guard>} />
        <Route path="/barang-keluar" element={<Guard any={P_KELUAR}><BarangKeluar /></Guard>} />
        <Route path="/riwayat" element={<Guard any={P_RIWAYAT}><Riwayat /></Guard>} />
        <Route path="/gudang" element={<Guard any={P_GUDANG}><Gudang /></Guard>} />
        <Route path="/supplier" element={<Guard any={P_SUPPLIER}><SupplierPage /></Guard>} />
        <Route element={<InternalLayout />}>
          <Route path="/internal/dashboard" element={<Guard any={["dashboard"]}><InternalDashboard /></Guard>} />
          <Route path="/internal/harga" element={<Guard any={["harga"]}><Harga /></Guard>} />
          <Route path="/internal/bandul" element={<Guard any={["bandul"]}><BandulPage /></Guard>} />
          <Route path="/internal/pembelian" element={<Guard any={["pembelian"]}><Pembelian /></Guard>} />
          <Route path="/internal/berat-koli" element={<Guard any={["berat_koli"]}><BeratKoli /></Guard>} />
          <Route path="/internal/penjualan" element={<Guard any={["penjualan"]}><Penjualan /></Guard>} />
          <Route path="/internal/busai" element={<Guard any={["busai"]}><Busai /></Guard>} />
          <Route path="/internal/kasir" element={<Guard any={["kasir"]}><Kasir /></Guard>} />
          <Route path="/internal/detail-koli" element={<Guard any={["detail_koli"]}><DetailKoli /></Guard>} />
          <Route path="/internal/laporan-penjualan" element={<Guard any={["laporan_penjualan"]}><LaporanPenjualan /></Guard>} />
          <Route path="/internal/sisa-stock" element={<Guard any={["sisa_stock"]}><SisaStock /></Guard>} />
          <Route path="/internal/out" element={<Guard any={["out"]}><Out /></Guard>} />
          <Route path="/internal/revisi" element={<Guard any={["revisi"]}><Revisi /></Guard>} />
          <Route path="/internal/detail-koli-cc" element={<Guard any={["detail_koli_cc"]}><DetailKoliCC /></Guard>} />
        </Route>
        <Route path="/asisten" element={<Asisten />} />
        <Route path="/pengguna" element={<Pengguna />} />
        <Route path="/master-data" element={<MasterData />} />
        <Route path="*" element={home} />
      </Route>
    </Routes>
  );
}
