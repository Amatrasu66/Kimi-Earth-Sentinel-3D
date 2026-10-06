export const atmosphereVertexShader = `
varying vec3 vNormal;
varying vec3 vPosition;
varying float atmosphereIntensity;

void main() {
  vNormal = normalize(normalMatrix * normal);
  vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
  atmosphereIntensity = pow(0.6 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const atmosphereFragmentShader = `
uniform vec3 color;
varying vec3 vNormal;
varying float atmosphereIntensity;

void main() {
  float intensity = pow(0.6 - dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)), 2.0);
  gl_FragColor = vec4(color, 1.0) * intensity * 1.5;
}
`;
