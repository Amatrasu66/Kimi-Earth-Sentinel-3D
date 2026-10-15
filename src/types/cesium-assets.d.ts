/**
 * Ambient declaration for the CesiumJS widget stylesheet.
 *
 * Imported dynamically inside `CesiumEarth` (client-only chunk) so the
 * default route never evaluates it. The package ships no TypeScript
 * declaration for this CSS entry, hence the explicit module shim.
 */
declare module 'cesium/Build/Cesium/Widgets/widgets.css';
