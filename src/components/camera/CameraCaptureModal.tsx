import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, RefreshCw, X } from "lucide-react";
import type { SamplePhotoRole } from "../../types/analysis";
import { PHOTO_ROLE_LABELS } from "../../types/analysis";

interface CameraCaptureModalProps {
  open: boolean;
  role: SamplePhotoRole;
  instruction: string;
  onCaptureBlob: (blob: Blob, source: "camera" | "upload") => void;
  onClose: () => void;
}

export function CameraCaptureModal({
  open,
  role,
  instruction,
  onCaptureBlob,
  onClose,
}: CameraCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const [cameraState, setCameraState] = useState<
    "starting" | "ready" | "unavailable"
  >("starting");
  const [errorDetail, setErrorDetail] = useState<string>("");
  const [facingMode, setFacingMode] = useState<"environment" | "user">(
    "environment"
  );

  useEffect(() => {
    if (!open) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      return;
    }

    let cancelled = false;
    setCameraState("starting");
    setErrorDetail("");

    async function startStream() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraState("unavailable");
        setErrorDetail(
          "Fotocamera diretta non supportata da questo browser: usa i pulsanti di scatto nativo o caricamento file."
        );
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 960 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraState("ready");
      } catch {
        if (!cancelled) {
          setCameraState("unavailable");
          setErrorDetail(
            "Accesso alla fotocamera in tempo reale non autorizzato o assente. Puoi acquisire la foto tramite la fotocamera del telefono o dalla galleria."
          );
        }
      }
    }

    startStream();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [open, facingMode]);

  if (!open) return null;

  function handleSnapFrame() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (blob) {
          onCaptureBlob(blob, "camera");
        }
      },
      "image/jpeg",
      0.9
    );
  }

  function handleFileChange(
    e: React.ChangeEvent<HTMLInputElement>,
    source: "camera" | "upload"
  ) {
    const file = e.target.files?.[0];
    if (file) {
      onCaptureBlob(file, source);
    }
    e.target.value = "";
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Acquisizione foto: ${PHOTO_ROLE_LABELS[role]}`}
      className="fixed inset-0 z-50 bg-forest-950/90 backdrop-blur-sm flex flex-col justify-between p-4 md:p-6"
    >
      {/* Top Bar */}
      <div className="max-w-2xl w-full mx-auto flex items-center justify-between gap-4 text-white">
        <div className="min-w-0">
          <p className="text-xs text-gold-200 font-medium">
            Inquadratura guidata
          </p>
          <h2 className="font-display text-lg font-semibold truncate">
            {PHOTO_ROLE_LABELS[role]}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Chiudi fotocamera"
          className="min-h-[44px] min-w-[44px] rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Center Viewfinder or Fallback */}
      <div className="max-w-2xl w-full mx-auto my-4 flex-1 flex flex-col items-center justify-center">
        <div className="relative w-full aspect-[4/3] max-h-[60vh] rounded-2xl overflow-hidden bg-forest-900 border border-white/15 flex items-center justify-center">
          {cameraState !== "unavailable" && (
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          )}

          {cameraState === "starting" && (
            <div className="absolute inset-0 flex items-center justify-center bg-forest-950/70 text-white text-sm">
              Attivazione fotocamera...
            </div>
          )}

          {cameraState === "ready" && (
            <div className="pointer-events-none absolute inset-6 border border-gold-200/70 rounded-xl">
              <div className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 border-gold-500 rounded-tl-md" />
              <div className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-gold-500 rounded-tr-md" />
              <div className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 border-gold-500 rounded-bl-md" />
              <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-gold-500 rounded-br-md" />
            </div>
          )}

          {cameraState === "unavailable" && (
            <div className="p-6 text-center max-w-md space-y-4 text-white">
              <Camera className="w-10 h-10 mx-auto text-gold-500" />
              <p className="text-sm text-white/85 leading-relaxed">
                {errorDetail}
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => nativeCameraInputRef.current?.click()}
                  className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl bg-gold-500 text-forest-950 text-sm font-semibold hover:bg-gold-200 transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  <Camera className="w-4 h-4" />
                  Apri fotocamera dispositivo
                </button>
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl bg-white/15 text-white text-sm font-medium hover:bg-white/25 transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  <ImagePlus className="w-4 h-4" />
                  Carica immagine
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="mt-3 text-center text-xs md:text-sm text-white/80 max-w-lg">
          {instruction}
        </p>
      </div>

      {/* Bottom Controls */}
      <div className="max-w-2xl w-full mx-auto flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => galleryInputRef.current?.click()}
          className="min-h-[44px] px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs md:text-sm font-medium flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
        >
          <ImagePlus className="w-4 h-4" />
          Galleria
        </button>

        {cameraState === "ready" ? (
          <button
            type="button"
            onClick={handleSnapFrame}
            className="min-h-[48px] px-7 py-3 rounded-full bg-gold-500 hover:bg-gold-200 text-forest-950 text-sm font-semibold flex items-center gap-2 shadow-lg active:scale-[0.97] transition-all cursor-pointer whitespace-nowrap"
          >
            <Camera className="w-5 h-5" />
            Scatta foto
          </button>
        ) : (
          <button
            type="button"
            onClick={() => nativeCameraInputRef.current?.click()}
            className="min-h-[48px] px-6 py-3 rounded-full bg-gold-500 hover:bg-gold-200 text-forest-950 text-sm font-semibold flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <Camera className="w-5 h-5" />
            Fotocamera nativa
          </button>
        )}

        <button
          type="button"
          onClick={() =>
            setFacingMode((prev) =>
              prev === "environment" ? "user" : "environment"
            )
          }
          aria-label="Cambia fotocamera"
          className="min-h-[44px] min-w-[44px] px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
        >
          <RefreshCw className="w-4 h-4" />
          <span className="hidden sm:inline">Ruota</span>
        </button>
      </div>

      {/* Hidden inputs for native smartphone capture and file upload */}
      <input
        ref={nativeCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFileChange(e, "camera")}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFileChange(e, "upload")}
      />
    </div>
  );
}
