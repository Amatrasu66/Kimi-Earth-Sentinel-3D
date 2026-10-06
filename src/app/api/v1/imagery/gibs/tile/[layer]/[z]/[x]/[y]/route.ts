import { NextResponse } from "next/server";
import { serverConfig } from "@/server/config";
import { buildTileUrl, isAllowedLayer, isValidTile } from "@/server/providers/imagery";
import { fail, internalError } from "@/server/route-helpers";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ layer: string; z: string; x: string; y: string }> },
) {
  try {
    const { layer, z: zRaw, x: xRaw, y: yRaw } = await params;
    // Allow-list prevents open-redirect abuse via the layer segment.
    if (!isAllowedLayer(layer)) {
      return fail(`Imagery layer ${JSON.stringify(layer)} not found.`, "NOT_FOUND", 404);
    }
    const z = Number(zRaw);
    const x = Number(xRaw);
    const y = Number(yRaw);
    if (![z, x, y].every((n) => Number.isInteger(n)) || !isValidTile(layer, z, x, y)) {
      return fail("Invalid tile coordinates.");
    }
    const gibsUrl = buildTileUrl(serverConfig.nasaGibsUrl, layer, z, x, y);
    return NextResponse.redirect(gibsUrl, 302);
  } catch (e) {
    return internalError(e);
  }
}
