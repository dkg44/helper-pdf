import React, { forwardRef, useImperativeHandle, useRef, useState, useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { CornerPoint, QuadCorners } from './scannerService';

export interface WarpResult {
  uri: string;
  width: number;
  height: number;
}

export interface ExtractedPdfPage {
  pageNumber: number;
  uri: string;
  width: number;
  height: number;
}

export interface PerspectiveWarpBridgeRef {
  warpImage: (sourceUri: string, corners: QuadCorners, rotation?: number) => Promise<WarpResult>;
  combineIdCard: (frontUri: string, rearUri: string) => Promise<WarpResult>;
  extractPdfPages: (pdfUri: string) => Promise<ExtractedPdfPage[]>;
}

interface PendingJob {
  resolve: (res: WarpResult) => void;
  reject: (err: any) => void;
  timeoutId: any;
  sourceUri: string;
  corners: QuadCorners;
  rotation?: number;
}

/**
 * Perspective warping HTML with WebGL GPU hardware acceleration and 2D Canvas fallback.
 * Takes 4 arbitrary quadrilateral corners and rectifies the inclined page into an upright flat rectangle.
 */
const WARP_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js"></script>
</head>
<body style="margin:0;padding:0;background:transparent;">
  <canvas id="warpCanvas" style="display:none;"></canvas>
  <script>
    const canvas = document.getElementById('warpCanvas');

    // Heckbert's Projective Mapping algorithm from unit square [0,1]^2 to source quad (x, y)
    function getProjectiveMatrix(p0, p1, p2, p3) {
      const dx1 = p1.x - p2.x;
      const dx2 = p3.x - p2.x;
      const sx  = p0.x - p1.x + p2.x - p3.x;
      const dy1 = p1.y - p2.y;
      const dy2 = p3.y - p2.y;
      const sy  = p0.y - p1.y + p2.y - p3.y;

      let a, b, c, d, e, f, g, h;
      if (Math.abs(sx) < 1e-5 && Math.abs(sy) < 1e-5) {
        // Parallelogram / Affine
        a = p1.x - p0.x;
        b = p3.x - p0.x;
        c = p0.x;
        d = p1.y - p0.y;
        e = p3.y - p0.y;
        f = p0.y;
        g = 0;
        h = 0;
      } else {
        const denom = dx1 * dy2 - dx2 * dy1;
        if (Math.abs(denom) < 1e-7) {
          g = 0; h = 0;
        } else {
          g = (sx * dy2 - dx2 * sy) / denom;
          h = (dx1 * sy - sx * dy1) / denom;
        }
        a = p1.x - p0.x + g * p1.x;
        b = p3.x - p0.x + h * p3.x;
        c = p0.x;
        d = p1.y - p0.y + g * p1.y;
        e = p3.y - p0.y + h * p3.y;
        f = p0.y;
      }
      return [a, b, c, d, e, f, g, h];
    }

    function renderWithWebGL(gl, img, s0, s1, s2, s3, origW, origH, destW, destH) {
      const p0 = { x: s0.x / origW, y: s0.y / origH };
      const p1 = { x: s1.x / origW, y: s1.y / origH };
      const p2 = { x: s2.x / origW, y: s2.y / origH };
      const p3 = { x: s3.x / origW, y: s3.y / origH };

      const M = getProjectiveMatrix(p0, p1, p2, p3);

      const vs = 'attribute vec2 a_pos; varying vec2 v_uv; void main() { v_uv = (a_pos + 1.0) * 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }';
      const fs = 'precision mediump float; uniform sampler2D u_tex; uniform float u_M[8]; varying vec2 v_uv; void main() { float u = v_uv.x; float v = 1.0 - v_uv.y; float W = u_M[6] * u + u_M[7] * v + 1.0; float srcX = (u_M[0] * u + u_M[1] * v + u_M[2]) / W; float srcY = (u_M[3] * u + u_M[4] * v + u_M[5]) / W; if (srcX < 0.0 || srcX > 1.0 || srcY < 0.0 || srcY > 1.0) { gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0); } else { gl_FragColor = texture2D(u_tex, vec2(srcX, srcY)); } }';

      function createShader(type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        return s;
      }

      const prog = gl.createProgram();
      gl.attachShader(prog, createShader(gl.VERTEX_SHADER, vs));
      gl.attachShader(prog, createShader(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(prog);
      gl.useProgram(prog);

      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
        -1,  1,
         1, -1,
         1,  1
      ]), gl.STATIC_DRAW);

      const a_pos = gl.getAttribLocation(prog, 'a_pos');
      gl.enableVertexAttribArray(a_pos);
      gl.vertexAttribPointer(a_pos, 2, gl.FLOAT, false, 0, 0);

      const u_M = gl.getUniformLocation(prog, 'u_M');
      gl.uniform1fv(u_M, new Float32Array(M));

      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

      gl.viewport(0, 0, destW, destH);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    function drawTriangleAffine(ctx, img, destTri, srcTri) {
      const d0 = destTri[0], d1 = destTri[1], d2 = destTri[2];
      const s0 = srcTri[0], s1 = srcTri[1], s2 = srcTri[2];

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(d0.x, d0.y);
      ctx.lineTo(d1.x, d1.y);
      ctx.lineTo(d2.x, d2.y);
      ctx.closePath();
      ctx.clip();

      const denom = (s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y));
      if (Math.abs(denom) > 1e-6) {
        const a = (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) / denom;
        const b = (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) / denom;
        const c = (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) / denom;
        const d = (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) / denom;
        const e = (d0.x * (s1.x * s2.y - s2.x * s1.y) + d1.x * (s2.x * s0.y - s0.x * s2.y) + d2.x * (s0.x * s1.y - s1.x * s0.y)) / denom;
        const f = (d0.y * (s1.x * s2.y - s2.x * s1.y) + d1.y * (s2.x * s0.y - s0.x * s2.y) + d2.x * (s0.x * s1.y - s1.x * s0.y)) / denom;
        ctx.transform(a, b, c, d, e, f);
        ctx.drawImage(img, 0, 0);
      }
      ctx.restore();
    }

    function renderWithCanvas2D(canvas, img, s0, s1, s2, s3, destW, destH) {
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, destW, destH);
      drawTriangleAffine(ctx, img, [{x:0, y:0}, {x:destW, y:0}, {x:destW, y:destH}], [s0, s1, s2]);
      drawTriangleAffine(ctx, img, [{x:0, y:0}, {x:destW, y:destH}, {x:0, y:destH}], [s0, s2, s3]);
    }

    window.startWarpJob = function(msg) {
      try {
        const img = new Image();
        img.onload = function() {
          try {
            const origW = img.naturalWidth || img.width;
            const origH = img.naturalHeight || img.height;
            const c = msg.corners;
            const s0 = { x: (c.tl.x / 100) * origW, y: (c.tl.y / 100) * origH };
            const s1 = { x: (c.tr.x / 100) * origW, y: (c.tr.y / 100) * origH };
            const s2 = { x: (c.br.x / 100) * origW, y: (c.br.y / 100) * origH };
            const s3 = { x: (c.bl.x / 100) * origW, y: (c.bl.y / 100) * origH };

            const dist = function(pA, pB) { return Math.hypot(pA.x - pB.x, pA.y - pB.y); };
            const topW = dist(s0, s1);
            const botW = dist(s3, s2);
            const leftH = dist(s0, s3);
            const rightH = dist(s1, s2);

            let destW = Math.max(topW, botW);
            let destH = Math.max(leftH, rightH);
            const maxDim = 1600;
            if (destW > maxDim || destH > maxDim) {
              const scale = maxDim / Math.max(destW, destH);
              destW *= scale;
              destH *= scale;
            }
            destW = Math.max(100, Math.round(destW));
            destH = Math.max(100, Math.round(destH));

            canvas.width = destW;
            canvas.height = destH;

            let gl = null;
            try {
              gl = canvas.getContext('webgl', { preserveDrawingBuffer: true }) ||
                   canvas.getContext('experimental-webgl', { preserveDrawingBuffer: true });
            } catch (e) {}

            if (gl) {
              renderWithWebGL(gl, img, s0, s1, s2, s3, origW, origH, destW, destH);
            } else {
              renderWithCanvas2D(canvas, img, s0, s1, s2, s3, destW, destH);
            }

            const dataUrl = canvas.toDataURL('image/jpeg', 0.94);
            const base64Data = dataUrl.split(',')[1];
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'WARP_SUCCESS',
              id: msg.id,
              base64: base64Data,
              width: destW,
              height: destH
            }));
          } catch (procErr) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'WARP_ERROR',
              id: msg.id,
              error: procErr.message || 'Processing failed'
            }));
          }
        };
        img.onerror = function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'WARP_ERROR',
            id: msg.id,
            error: 'Failed to load image source'
          }));
        };
        img.src = msg.imageSrc;
      } catch (err) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'WARP_ERROR',
          id: msg.id,
          error: err.message || 'Unknown error'
        }));
      }
    };

    // ── ID CARD COMBINER: Combines Front & Rear into 1 Single A4 Page ──
    window.startCombineIdCardJob = function(msg) {
      try {
        var imgFront = new Image();
        var imgRear = new Image();
        var loadedCount = 0;
        function onBothLoaded() {
          try {
            var pageW = 1240;
            var pageH = 1754;
            canvas.width = pageW;
            canvas.height = pageH;
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, pageW, pageH);

            var cardW = 980;
            var cardH = Math.round(cardW / 1.586);
            var cardX = (pageW - cardW) / 2;
            var card1Y = 160;
            var card2Y = 890;

            function renderCard(img, x, y, w, h, label) {
              ctx.fillStyle = '#1e293b';
              ctx.font = 'bold 26px sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText(label, pageW / 2, y - 18);

              ctx.save();
              ctx.beginPath();
              var r = 24;
              ctx.moveTo(x + r, y);
              ctx.lineTo(x + w - r, y);
              ctx.quadraticCurveTo(x + w, y, x + w, y + r);
              ctx.lineTo(x + w, y + h - r);
              ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
              ctx.lineTo(x + r, y + h);
              ctx.quadraticCurveTo(x, y + h, x, y + h - r);
              ctx.lineTo(x, y + r);
              ctx.quadraticCurveTo(x, y, x + r, y);
              ctx.closePath();
              ctx.clip();

              var srcW = img.naturalWidth || img.width;
              var srcH = img.naturalHeight || img.height;
              var scale = Math.max(w / srcW, h / srcH);
              var sW = srcW * scale;
              var sH = srcH * scale;
              var oX = x + (w - sW) / 2;
              var oY = y + (h - sH) / 2;
              ctx.drawImage(img, oX, oY, sW, sH);
              ctx.restore();

              ctx.beginPath();
              ctx.moveTo(x + r, y);
              ctx.lineTo(x + w - r, y);
              ctx.quadraticCurveTo(x + w, y, x + w, y + r);
              ctx.lineTo(x + w, y + h - r);
              ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
              ctx.lineTo(x + r, y + h);
              ctx.quadraticCurveTo(x, y + h, x, y + h - r);
              ctx.lineTo(x, y + r);
              ctx.quadraticCurveTo(x, y, x + r, y);
              ctx.closePath();
              ctx.lineWidth = 3;
              ctx.strokeStyle = '#cbd5e1';
              ctx.stroke();
            }

            renderCard(imgFront, cardX, card1Y, cardW, cardH, 'FRONT SIDE');
            renderCard(imgRear, cardX, card2Y, cardW, cardH, 'REAR / BACK SIDE');

            ctx.fillStyle = '#94a3b8';
            ctx.font = '18px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Helper PDF Scanner • 1-Page Dual-Side ID Document', pageW / 2, 1630);

            var dataUrl = canvas.toDataURL('image/jpeg', 0.94);
            var base64Data = dataUrl.split(',')[1];
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'COMBINE_ID_SUCCESS',
              id: msg.id,
              base64: base64Data,
              width: pageW,
              height: pageH
            }));
          } catch (renderErr) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'COMBINE_ID_ERROR',
              id: msg.id,
              error: renderErr.message || 'Error rendering combined ID'
            }));
          }
        }

        imgFront.onload = function() { loadedCount++; if (loadedCount === 2) onBothLoaded(); };
        imgFront.onerror = function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'COMBINE_ID_ERROR', id: msg.id, error: 'Failed loading front photo' }));
        };
        imgRear.onload = function() { loadedCount++; if (loadedCount === 2) onBothLoaded(); };
        imgRear.onerror = function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'COMBINE_ID_ERROR', id: msg.id, error: 'Failed loading rear photo' }));
        };

        imgFront.src = msg.frontSrc;
        imgRear.src = msg.rearSrc;
      } catch (e) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'COMBINE_ID_ERROR',
          id: msg.id,
          error: e.message || 'Unknown combine error'
        }));
      }
    };

    // ── PDF PAGE EXTRACTOR: Splits PDF into Individual High-Res Canvas Pages ──
    window.startPdfExtractJob = async function(msg) {
      try {
        if (typeof pdfjsLib === 'undefined') {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'PDF_EXTRACT_ERROR',
            id: msg.id,
            error: 'PDF.js is not loaded'
          }));
          return;
        }
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
        var binary = atob(msg.pdfBase64);
        var pdf = await pdfjsLib.getDocument({ data: binary }).promise;
        var total = pdf.numPages;
        var extractedPages = [];
        for (var p = 1; p <= total; p++) {
          var page = await pdf.getPage(p);
          var viewport = page.getViewport({ scale: 1.5 });
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport: viewport }).promise;
          var dUrl = canvas.toDataURL('image/jpeg', 0.88);
          extractedPages.push({
            pageNumber: p,
            width: Math.round(viewport.width),
            height: Math.round(viewport.height),
            base64: dUrl.split(',')[1]
          });
        }
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'PDF_EXTRACT_SUCCESS',
          id: msg.id,
          pages: extractedPages
        }));
      } catch (err) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'PDF_EXTRACT_ERROR',
          id: msg.id,
          error: err.message || 'Failed extracting PDF pages'
        }));
      }
    };

    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ENGINE_READY' }));
  </script>
</body>
</html>
`;

export interface PerspectiveWarpBridgeProps {}

const WebViewAny = WebView as any;

export const PerspectiveWarpBridge = forwardRef<PerspectiveWarpBridgeRef, PerspectiveWarpBridgeProps>((_props, ref) => {
  const webViewRef = useRef<any>(null);
  const [isEngineReady, setIsEngineReady] = useState(false);
  const pendingJobs = useRef<Map<string, PendingJob>>(new Map());
  const pendingIdJobs = useRef<Map<string, {
    resolve: (res: WarpResult) => void;
    reject: (err: any) => void;
    timeoutId: any;
    frontUri: string;
    rearUri: string;
  }>>(new Map());
  const pendingPdfJobs = useRef<Map<string, {
    resolve: (pages: ExtractedPdfPage[]) => void;
    reject: (err: any) => void;
    timeoutId: any;
    pdfUri: string;
  }>>(new Map());

  const handleFallbackCrop = async (job: PendingJob): Promise<WarpResult> => {
    try {
      const probe = await ImageManipulator.manipulateAsync(job.sourceUri, []);
      const c = job.corners;
      const minX = Math.max(0, Math.min(c.tl.x, c.bl.x));
      const maxX = Math.min(100, Math.max(c.tr.x, c.br.x));
      const minY = Math.max(0, Math.min(c.tl.y, c.tr.y));
      const maxY = Math.min(100, Math.max(c.bl.y, c.br.y));

      const originX = Math.round((minX / 100) * probe.width);
      const originY = Math.round((minY / 100) * probe.height);
      const width = Math.max(40, Math.round(((maxX - minX) / 100) * probe.width));
      const height = Math.max(40, Math.round(((maxY - minY) / 100) * probe.height));

      const manip = await ImageManipulator.manipulateAsync(
        job.sourceUri,
        [{ crop: { originX, originY, width, height } }],
        { format: ImageManipulator.SaveFormat.JPEG, compress: 0.94 }
      );
      return { uri: manip.uri, width: manip.width, height: manip.height };
    } catch {
      return { uri: job.sourceUri, width: 800, height: 1100 };
    }
  };

  useImperativeHandle(ref, () => ({
    warpImage: async (sourceUri: string, corners: QuadCorners, rotation: number = 0): Promise<WarpResult> => {
      // 1. Prepare image (apply rotation first if needed)
      let activeUri = sourceUri;
      if (rotation && rotation % 360 !== 0) {
        try {
          const rotRes = await ImageManipulator.manipulateAsync(sourceUri, [{ rotate: rotation }]);
          activeUri = rotRes.uri;
        } catch (e) {
          console.warn('Rotation failed before warp:', e);
        }
      }

      // Check if corners are trivial/no crop (all ~0 and ~100)
      const isFullPhoto =
        corners.tl.x <= 1 && corners.tl.y <= 1 &&
        corners.tr.x >= 99 && corners.tr.y <= 1 &&
        corners.br.x >= 99 && corners.br.y >= 99 &&
        corners.bl.x <= 1 && corners.bl.y >= 99;

      if (isFullPhoto) {
        try {
          const probe = await ImageManipulator.manipulateAsync(activeUri, []);
          return { uri: activeUri, width: probe.width, height: probe.height };
        } catch {
          return { uri: activeUri, width: 800, height: 1100 };
        }
      }

      return new Promise<WarpResult>(async (resolve, reject) => {
        const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

        // Timeout fallback after 4 seconds
        const timeoutId = setTimeout(async () => {
          const pending = pendingJobs.current.get(jobId);
          if (pending) {
            pendingJobs.current.delete(jobId);
            console.warn('Warp engine timed out, using fallback crop');
            const fallback = await handleFallbackCrop(pending);
            resolve(fallback);
          }
        }, 4000);

        const job: PendingJob = {
          resolve,
          reject,
          timeoutId,
          sourceUri: activeUri,
          corners,
          rotation,
        };

        pendingJobs.current.set(jobId, job);

        try {
          // Read image as base64 data url for 100% reliable WebView loading
          const base64 = await FileSystem.readAsStringAsync(activeUri, { encoding: 'base64' });
          const dataUrl = `data:image/jpeg;base64,${base64}`;

          const payload = JSON.stringify({
            id: jobId,
            imageSrc: dataUrl,
            corners,
          });

          webViewRef.current?.injectJavaScript(`
            if (window.startWarpJob) {
              window.startWarpJob(${payload});
            } else {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'WARP_ERROR', id: '${jobId}', error: 'Engine not ready' }));
            }
            true;
          `);
        } catch (err: any) {
          clearTimeout(timeoutId);
          pendingJobs.current.delete(jobId);
          console.warn('Failed to read image for warp, falling back:', err);
          const fb = await handleFallbackCrop(job);
          resolve(fb);
        }
      });
    },

    combineIdCard: async (frontUri: string, rearUri: string): Promise<WarpResult> => {
      return new Promise<WarpResult>(async (resolve, reject) => {
        const jobId = `idjob_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const timeoutId = setTimeout(() => {
          const pending = pendingIdJobs.current.get(jobId);
          if (pending) {
            pendingIdJobs.current.delete(jobId);
            console.warn('Combine ID engine timed out, using fallback');
            resolve({ uri: frontUri, width: 1240, height: 1754 });
          }
        }, 10000);

        pendingIdJobs.current.set(jobId, { resolve, reject, timeoutId, frontUri, rearUri });

        try {
          const frontBase64 = await FileSystem.readAsStringAsync(frontUri, { encoding: 'base64' });
          const rearBase64 = await FileSystem.readAsStringAsync(rearUri, { encoding: 'base64' });
          const payload = JSON.stringify({
            id: jobId,
            frontSrc: `data:image/jpeg;base64,${frontBase64}`,
            rearSrc: `data:image/jpeg;base64,${rearBase64}`,
          });

          webViewRef.current?.injectJavaScript(`
            if (window.startCombineIdCardJob) {
              window.startCombineIdCardJob(${payload});
            } else {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'COMBINE_ID_ERROR', id: '${jobId}', error: 'Engine not ready' }));
            }
            true;
          `);
        } catch (err: any) {
          clearTimeout(timeoutId);
          pendingIdJobs.current.delete(jobId);
          resolve({ uri: frontUri, width: 1240, height: 1754 });
        }
      });
    },

    extractPdfPages: async (pdfUri: string): Promise<ExtractedPdfPage[]> => {
      return new Promise<ExtractedPdfPage[]>(async (resolve, reject) => {
        const jobId = `pdfjob_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const timeoutId = setTimeout(() => {
          const pending = pendingPdfJobs.current.get(jobId);
          if (pending) {
            pendingPdfJobs.current.delete(jobId);
            console.warn('PDF extract timed out');
            reject(new Error('PDF extraction timed out.'));
          }
        }, 40000);

        pendingPdfJobs.current.set(jobId, { resolve, reject, timeoutId, pdfUri });

        try {
          const pdfBase64 = await FileSystem.readAsStringAsync(pdfUri, { encoding: 'base64' });
          const payload = JSON.stringify({
            id: jobId,
            pdfBase64: pdfBase64,
          });

          webViewRef.current?.injectJavaScript(`
            if (window.startPdfExtractJob) {
              window.startPdfExtractJob(${payload});
            } else {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'PDF_EXTRACT_ERROR', id: '${jobId}', error: 'Engine not ready' }));
            }
            true;
          `);
        } catch (err: any) {
          clearTimeout(timeoutId);
          pendingPdfJobs.current.delete(jobId);
          reject(err);
        }
      });
    },
  }));

  const onMessage = async (event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'ENGINE_READY') {
        setIsEngineReady(true);
        return;
      }

      if (msg.type === 'WARP_SUCCESS' && msg.id) {
        const job = pendingJobs.current.get(msg.id);
        if (job) {
          clearTimeout(job.timeoutId);
          pendingJobs.current.delete(msg.id);

          try {
            const outPath = `${FileSystem.cacheDirectory}scan_rectified_${Date.now()}.jpg`;
            await FileSystem.writeAsStringAsync(outPath, msg.base64, { encoding: 'base64' });
            job.resolve({ uri: outPath, width: msg.width, height: msg.height });
          } catch (writeErr) {
            console.warn('Failed writing warped image to file:', writeErr);
            const fb = await handleFallbackCrop(job);
            job.resolve(fb);
          }
        }
      } else if (msg.type === 'WARP_ERROR' && msg.id) {
        const job = pendingJobs.current.get(msg.id);
        if (job) {
          clearTimeout(job.timeoutId);
          pendingJobs.current.delete(msg.id);
          console.warn('Warp engine error:', msg.error);
          const fb = await handleFallbackCrop(job);
          job.resolve(fb);
        }
      }

      if (msg.type === 'COMBINE_ID_SUCCESS' && msg.id) {
        const job = pendingIdJobs.current.get(msg.id);
        if (job) {
          clearTimeout(job.timeoutId);
          pendingIdJobs.current.delete(msg.id);
          try {
            const outPath = `${FileSystem.documentDirectory}id_card_1page_${Date.now()}.jpg`;
            await FileSystem.writeAsStringAsync(outPath, msg.base64, { encoding: 'base64' });
            job.resolve({ uri: outPath, width: msg.width, height: msg.height });
          } catch (writeErr) {
            job.resolve({ uri: job.frontUri, width: 1240, height: 1754 });
          }
        }
      } else if (msg.type === 'COMBINE_ID_ERROR' && msg.id) {
        const job = pendingIdJobs.current.get(msg.id);
        if (job) {
          clearTimeout(job.timeoutId);
          pendingIdJobs.current.delete(msg.id);
          job.resolve({ uri: job.frontUri, width: 1240, height: 1754 });
        }
      }

      if (msg.type === 'PDF_EXTRACT_SUCCESS' && msg.id) {
        const job = pendingPdfJobs.current.get(msg.id);
        if (job) {
          clearTimeout(job.timeoutId);
          pendingPdfJobs.current.delete(msg.id);
          try {
            const results: ExtractedPdfPage[] = [];
            for (const p of msg.pages) {
              const outPath = `${FileSystem.documentDirectory}extracted_page_${Date.now()}_${p.pageNumber}.jpg`;
              await FileSystem.writeAsStringAsync(outPath, p.base64, { encoding: 'base64' });
              results.push({
                pageNumber: p.pageNumber,
                uri: outPath,
                width: p.width,
                height: p.height,
              });
            }
            job.resolve(results);
          } catch (writeErr: any) {
            job.reject(writeErr);
          }
        }
      } else if (msg.type === 'PDF_EXTRACT_ERROR' && msg.id) {
        const job = pendingPdfJobs.current.get(msg.id);
        if (job) {
          clearTimeout(job.timeoutId);
          pendingPdfJobs.current.delete(msg.id);
          job.reject(new Error(msg.error || 'Failed to extract PDF'));
        }
      }
    } catch (e) {
      console.warn('Error handling warp bridge message:', e);
    }
  };

  return (
    <View style={styles.hiddenContainer} pointerEvents="none">
      <WebViewAny
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: WARP_HTML }}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        style={styles.hiddenWebView}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  hiddenContainer: {
    width: 1,
    height: 1,
    opacity: 0,
    position: 'absolute',
    bottom: -100,
    left: -100,
  },
  hiddenWebView: {
    width: 1,
    height: 1,
    backgroundColor: 'transparent',
  },
});
