export const nightBlendVertexShader = `
varying vec2 vUv;
varying vec3 vNormal;
uniform vec3 sunDirection;

void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const nightBlendFragmentShader = `
uniform sampler2D dayTexture;
uniform sampler2D nightTexture;
uniform vec3 sunDirection;

varying vec2 vUv;
varying vec3 vNormal;

void main() {
  vec4 dayColor = texture2D(dayTexture, vUv);
  vec4 nightColor = texture2D(nightTexture, vUv);
  
  float cosAngle = dot(vNormal, sunDirection);
  float mixFactor = smoothstep(-0.1, 0.1, cosAngle);
  
  gl_FragColor = mix(nightColor, dayColor, mixFactor);
}
`;
