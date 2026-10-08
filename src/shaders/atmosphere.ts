export const atmosphereVertexShader = `
varying vec3 vNormal;
varying vec3 vPosition;
varying float atmosphereIntensity;

void main() {
  vNormal = normalize(normalMatrix * normal);
  vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
  atmosphereIntensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const atmosphereFragmentShader = `
uniform vec3 color;
varying vec3 vNormal;
varying float atmosphereIntensity;

void main() {
  // Restrained rim: tight falloff (pow 3.0) and low gain (0.5) so the edge
  // reads as separation from space, not a neon ring. See WebGPUEarth for
  // the matching WebGPU-path parameters.
  float intensity = pow(0.65 - dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)), 3.0);
  gl_FragColor = vec4(color, 1.0) * intensity * 0.5;
}
`;
