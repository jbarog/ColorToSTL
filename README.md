# SplitSTL

Separa imágenes PNG/JPG en capas de color y genera un archivo STL por capa, listo para impresión 3D o serigrafía.

**Demo:** https://jbarog.github.io/ColorToSTL/

---

## Qué hace

1. **Sube** una imagen PNG, JPG o WebP.
2. **Cuantiza** los colores automáticamente (K-means++, de 2 a 8 colores).
3. **Muestra** una vista previa de cada capa con su color dominante.
4. **Genera** un STL por capa: placa base + relieve de los píxeles de ese color + asa trasera.
5. **Marco de registro**: descarga un marco hueco con holgura de 0,5 mm para centrar todas las capas al serigrafiar.

---

## Uso local

```bash
npm install
npm run dev
# → http://localhost:5173
```

## Build

```bash
npm run build
# Genera dist/
```

---

## STL generado

Cada STL contiene:

```
Z < 0                → asa (agarre al voltear la placa)
0 … plateHeight      → placa base
plateHeight … total  → relieve (superficie de impresión)
```

El marco de registro tiene el hueco interior = dimensiones de la placa + 0,25 mm de holgura en cada lado y altura = `plateHeight + reliefHeight`.

---

## Stack

| Paquete | Uso |
|---|---|
| [Three.js](https://threejs.org/) | Geometría 3D + exportación STL |
| [Vite](https://vitejs.dev/) | Bundler y servidor de desarrollo |

---

## Estructura

```
PngSplitToSTL/
├── src/
│   ├── quantizer.js     # K-means++ sobre píxeles de la imagen
│   ├── layers.js        # Máscaras por color, canvas preview
│   └── stlGenerator.js  # STL de capa + marco de registro
├── demo.js              # Lógica de la interfaz
├── index.html           # UI (sin framework)
└── .github/workflows/
    └── deploy.yml       # Deploy automático a GitHub Pages
```
