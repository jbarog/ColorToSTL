# ColorToSTL

Separates PNG/JPG images into color layers and generates an STL file per layer, ready for 3D printing or screen printing.

**Demo:** https://jbarog.github.io/ColorToSTL/

---

## What it does

1. **Upload** a PNG, JPG or WebP image.
2. **Quantizes** colors automatically (K-means++, from 2 to 8 colors).
3. **Shows** a preview of each layer with its dominant color.
4. **Generates** an STL per layer: base plate + relief of the pixels of that color + back handle.
5. **Registration frame**: download a hollow frame with 0.5 mm clearance to center all layers when screen printing.

---

## Local usage

```bash
npm install
npm run dev
# → http://localhost:5173
```

## Build

```bash
npm run build
# Generates dist/
```

---

## Generated STL

Each STL contains:

```
Z < 0                → handle (grip when flipping the plate)
0 … plateHeight      → base plate
plateHeight … total  → relief (printing surface)
```

The registration frame has the inner hole = plate dimensions + 0.25 mm clearance on each side and height = `plateHeight + reliefHeight`.

---

## Stack

| Package | Use |
|---|---|
| [Three.js](https://threejs.org/) | 3D geometry + STL export |
| [Vite](https://vitejs.dev/) | Bundler and development server |

---

## Structure

```
ColorToSTL/
├── src/
│   ├── quantizer.js     # K-means++ on image pixels
│   ├── layers.js        # Masks per color, canvas preview
│   └── stlGenerator.js  # Layer STL + registration frame
├── demo.js              # Interface logic
├── index.html           # UI (no framework)
└── .github/workflows/
    └── deploy.yml       # Automatic deploy to GitHub Pages
```
