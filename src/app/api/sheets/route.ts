import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { google } from "googleapis";
import { NextResponse } from "next/server";
import NodeCache from "node-cache";

// Buat instance cache. Data akan disimpan selama 10 menit (600 detik).
const cache = new NodeCache({ stdTTL: 600 });

interface CustomSession extends Session {
  accessToken?: string;
}

export async function GET() {
  const session: CustomSession | null = await getServerSession(authOptions);

  if (!session || !session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sheetId = process.env.SHEET_ID;
  if (!sheetId) {
    return NextResponse.json(
      { error: "SHEET_ID tidak dikonfigurasi." },
      { status: 500 }
    );
  }

  // Gunakan kunci yang konsisten untuk cache
  const cacheKey = `sheets-data-${sheetId}`;

  // 1. Cek apakah data ada di cache
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    console.log("Mengembalikan data dari cache.");
    return NextResponse.json({ values: cachedData });
  }

  console.log("Mengambil data baru dari Google Sheets.");
  try {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: session.accessToken });
    const sheets = google.sheets({ version: "v4", auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "'Lembar Kerja'!A:Y",
    });

    const values = response.data.values || [];

    const dataWithRowIndex = values.map((row, index) => ({
      rowIndex: index + 1,
      rowData: row,
    }));

    // 2. Simpan hasil ke cache sebelum mengembalikannya
    cache.set(cacheKey, dataWithRowIndex);

    return NextResponse.json({ values: dataWithRowIndex });

  } catch (error: unknown) {
    let errorMessage = "Terjadi kesalahan yang tidak diketahui.";
    
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    console.error("Google Sheets API Error:", errorMessage);
    return NextResponse.json(
      {
        error: "Gagal mengambil data dari Google Sheets.",
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}