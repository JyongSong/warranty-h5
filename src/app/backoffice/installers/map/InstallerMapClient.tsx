"use client";

import Script from "next/script";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { LoadingButton } from "@/app/_components/LoadingIndicator";
import { formatDistanceKm } from "@/lib/installation/distance/geo";
import type { InstallerDistance } from "@/lib/installation/distance/service";
import BackofficePageHeader from "../../BackofficePageHeader";
import { getBackofficeButtonClass } from "../../backoffice-button-styles";
import { searchNearestInstallersAction, syncInstallerCoordinatesAction } from "./actions";

type InstallerMarker = {
  id: string;
  name: string;
  branch: string | null;
  phone: string | null;
  latitude: number;
  longitude: number;
};

type Counts = { total: number; noAddress: number; pending: number; notFound: number };

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    naver?: any;
  }
}

const KOREA_CENTER = { latitude: 36.3, longitude: 127.8 };
const SEARCH_ERROR_MESSAGES: Record<string, string> = {
  ADDRESS_REQUIRED: "주소를 입력해 주세요.",
  ADDRESS_NOT_FOUND: "주소를 찾지 못했습니다. 도로명과 건물번호까지 입력해 주세요.",
  UNAUTHORIZED: "다시 로그인해 주세요.",
};

export default function InstallerMapClient({
  markers,
  counts,
  canSyncCoordinates,
}: {
  markers: InstallerMarker[];
  counts: Counts;
  canSyncCoordinates: boolean;
}) {
  const router = useRouter();
  const clientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
  const mapElement = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const map = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customerMarker = useRef<any>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [address, setAddress] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [nearest, setNearest] = useState<InstallerDistance[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    const naver = window.naver;
    if (!scriptReady || !naver?.maps || !mapElement.current) return;

    map.current ??= new naver.maps.Map(mapElement.current, {
      center: new naver.maps.LatLng(KOREA_CENTER.latitude, KOREA_CENTER.longitude),
      zoom: 7,
    });
    const infoWindow = new naver.maps.InfoWindow({ content: "" });
    const placed = markers.map((installer) => {
      const marker = new naver.maps.Marker({
        map: map.current,
        position: new naver.maps.LatLng(installer.latitude, installer.longitude),
        title: installer.name,
      });
      naver.maps.Event.addListener(marker, "click", () => {
        const body = document.createElement("div");
        body.className = "px-3 py-2 text-sm";
        body.textContent = [installer.name, installer.branch, installer.phone].filter(Boolean).join(" · ");
        infoWindow.setContent(body);
        infoWindow.open(map.current, marker);
      });
      return marker;
    });

    return () => placed.forEach((marker) => marker.setMap(null));
  }, [markers, scriptReady]);

  function showSearchResult(customer: { latitude: number; longitude: number }, rows: InstallerDistance[]) {
    const naver = window.naver;
    if (!naver?.maps || !map.current) return;

    const position = new naver.maps.LatLng(customer.latitude, customer.longitude);
    customerMarker.current?.setMap(null);
    customerMarker.current = new naver.maps.Marker({
      map: map.current,
      position,
      title: "고객 주소",
      icon: {
        content:
          '<div style="width:18px;height:18px;border-radius:9999px;background:#dc2626;border:3px solid #fff;box-shadow:0 0 0 1px #dc2626"></div>',
        anchor: new naver.maps.Point(9, 9),
      },
    });

    const bounds = new naver.maps.LatLngBounds(position, position);
    for (const row of rows) {
      const installer = markers.find((marker) => marker.id === row.installerId);
      if (installer) bounds.extend(new naver.maps.LatLng(installer.latitude, installer.longitude));
    }
    map.current.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 60 });
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    setSearching(true);
    setSearchError(null);
    setNearest(null);
    try {
      const result = await searchNearestInstallersAction(address);
      if (!result.ok) {
        setSearchError(SEARCH_ERROR_MESSAGES[result.error] ?? "거리를 확인하지 못했습니다.");
        return;
      }
      setNearest(result.nearest);
      showSearchResult(result.customer, result.nearest);
    } catch {
      setSearchError("거리를 확인하지 못했습니다.");
    } finally {
      setSearching(false);
    }
  }

  async function syncCoordinates() {
    setSyncing(true);
    setSyncError(null);
    try {
      let remainingCount = counts.pending;
      while (remainingCount > 0) {
        const result = await syncInstallerCoordinatesAction();
        if (!result.ok) {
          setSyncError(`좌표 변환 실패: ${result.error}`);
          break;
        }
        remainingCount = result.remainingCount;
        if (result.processedCount === 0) break;
      }
      router.refresh();
    } catch {
      setSyncError("좌표 변환에 실패했습니다.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-4">
      <BackofficePageHeader title="기사 지도" />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
        <span>활성 기사 {counts.total}명</span>
        <span>지도 표시 {markers.length}명</span>
        <span>주소 없음 {counts.noAddress}명</span>
        <span>주소 확인 불가 {counts.notFound}명</span>
        <span>좌표 변환 대기 {counts.pending}명</span>
        {canSyncCoordinates && counts.pending > 0 ? (
          <LoadingButton
            type="button"
            loading={syncing}
            loadingLabel="변환 중"
            onClick={syncCoordinates}
            className={getBackofficeButtonClass("primary")}
          >
            좌표 변환
          </LoadingButton>
        ) : null}
        {syncError ? <span className="text-red-700">{syncError}</span> : null}
      </div>

      <form onSubmit={search} className="flex flex-wrap gap-2 rounded-md border border-zinc-200 bg-white p-4">
        <input
          type="search"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="고객 주소 입력 (예: 대구 중구 대봉로 260)"
          className="h-10 min-w-0 flex-1 rounded-md border border-zinc-300 px-3 text-sm text-zinc-950 outline-none focus:border-zinc-950"
        />
        <LoadingButton
          type="submit"
          loading={searching}
          loadingLabel="찾는 중"
          className={getBackofficeButtonClass("primary")}
        >
          가까운 기사 찾기
        </LoadingButton>
      </form>

      {clientId ? (
        <Script
          src={`https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}`}
          strategy="afterInteractive"
          onReady={() => setScriptReady(true)}
          onError={() => setMapError(true)}
        />
      ) : null}
      {!clientId || mapError ? (
        <p className="rounded-md border border-zinc-200 bg-white px-4 py-3 text-sm text-red-700">
          지도를 불러오지 못했습니다. 네이버 지도 설정을 확인해 주세요.
        </p>
      ) : null}
      {/* 결과가 지도를 밀어내면 지도가 기억한 위치와 어긋나 마커 클릭이 빗나간다. 지도 위에 띄운다. */}
      <div className="relative">
        <div ref={mapElement} className="h-[calc(100dvh-280px)] min-h-[480px] w-full rounded-md border border-zinc-200 bg-zinc-100" />
        {searchError || nearest ? (
          <div className="absolute left-3 top-3 z-10 w-80 max-w-[calc(100%-1.5rem)] rounded-md border border-zinc-200 bg-white shadow-md">
            {searchError ? <p className="px-4 py-3 text-sm text-red-700">{searchError}</p> : null}
            {nearest?.length === 0 ? (
              <p className="px-4 py-3 text-sm text-zinc-500">경로를 찾은 기사가 없습니다.</p>
            ) : null}
            {nearest?.map((installer, index) => (
              <div
                key={installer.installerId}
                className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3 text-sm last:border-b-0"
              >
                <span className="min-w-0 text-zinc-800">
                  {index + 1}. <span className="font-semibold text-zinc-950">{installer.installerName}</span>
                  {installer.installerBranch ? ` · ${installer.installerBranch}` : ""}
                </span>
                <span className="shrink-0 font-semibold text-zinc-950">
                  {formatDistanceKm(installer.drivingMeters as number)}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
