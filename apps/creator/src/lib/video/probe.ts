// Browser-only: reads a local video file's metadata before upload.

export interface VideoProbe {
  duration: number;
  width: number;
  height: number;
}

export function probeVideo(file: File): Promise<VideoProbe> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve({ duration: video.duration, width: video.videoWidth, height: video.videoHeight });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Video dosyası okunamadı"));
    };
    video.src = url;
  });
}

export const isLandscape = (p: VideoProbe) => p.width > 0 && p.height > 0 && p.width > p.height;

// The platform is vertical-first: horizontal videos are allowed but letterboxed in the app
export const LANDSCAPE_HINT =
  "Bu video yatay. En iyi izleme deneyimi için dikey (9:16) video öneriyoruz; yatay videolar uygulamada üstte ve altta siyah bantla gösterilir.";
