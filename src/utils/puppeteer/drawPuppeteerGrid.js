const browserScriptFunction = (gridSize, minorGridSize, majorLineColor, minorLineColor) => {
    const overlayId = 'puppeteer-grid-overlay';

    // --- Toggle & Cleanup ---
    const existingOverlay = document.getElementById(overlayId);
    if (existingOverlay) {
        if (window.puppeteerGridResizeHandler) {
            window.removeEventListener('resize', window.puppeteerGridResizeHandler);
            delete window.puppeteerGridResizeHandler;
        }
        existingOverlay.remove();
        return;
    }

    // --- Canvas Setup ---
    const canvas = document.createElement('canvas');
    canvas.id = overlayId;
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '2147483647';
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('Could not get 2d context for grid overlay canvas.');
        return;
    }

    // --- Reusable Grid Drawing Function ---
    const drawGrid = () => {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        ctx.font = '10px monospace';

        // Vertical lines...
        for (let x = 0; x < rect.width; x += minorGridSize) {
            const isMajorLine = x % gridSize === 0;
            ctx.beginPath();
            ctx.moveTo(x + 0.5, 0);
            ctx.lineTo(x + 0.5, rect.height);
            ctx.strokeStyle = isMajorLine ? majorLineColor : minorLineColor;
            ctx.lineWidth = isMajorLine ? 1 : 0.5;
            ctx.stroke();
            if (isMajorLine) {
                const labelText = String(x);
                const textMetrics = ctx.measureText(labelText);
                ctx.fillStyle = majorLineColor;
                ctx.fillRect(x + 2, 2, textMetrics.width + 6, 14);
                ctx.fillStyle = 'black';
                ctx.fillText(labelText, x + 5, 12);
            }
        }
        // Horizontal lines...
        for (let y = 0; y < rect.height; y += minorGridSize) {
            const isMajorLine = y % gridSize === 0;
            ctx.beginPath();
            ctx.moveTo(0, y + 0.5);
            ctx.lineTo(rect.width, y + 0.5);
            ctx.strokeStyle = isMajorLine ? majorLineColor : minorLineColor;
            ctx.lineWidth = isMajorLine ? 1 : 0.5;
            ctx.stroke();
            if (isMajorLine && y > 0) {
                const labelText = String(y);
                const textMetrics = ctx.measureText(labelText);
                ctx.fillStyle = majorLineColor;
                ctx.fillRect(2, y + 2, textMetrics.width + 6, 14);
                ctx.fillStyle = 'black';
                ctx.fillText(labelText, 5, y + 12);
            }
        }
    };

    // --- Event Listener Setup ---
    window.puppeteerGridResizeHandler = drawGrid;
    window.addEventListener('resize', window.puppeteerGridResizeHandler);
    drawGrid(); // Initial draw
};

export default browserScriptFunction;
