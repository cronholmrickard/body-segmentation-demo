// WebGLSegmenterRenderer.js
export default class WebGLSegmenterRenderer {
  /**
   * @param {HTMLVideoElement} video - The live video feed.
   * @param {HTMLImageElement|HTMLCanvasElement} backgroundSource - The background image or canvas.
   * @param {HTMLCanvasElement} maskSource - The offscreen canvas containing the binary mask.
   * @param {HTMLCanvasElement} outputCanvas - The canvas where the composite is rendered.
   */
  constructor(video, backgroundSource, maskSource, outputCanvas) {
    this.video = video;
    this.backgroundSource = backgroundSource;
    this.maskSource = maskSource;
    this.canvas = outputCanvas;
    this.gl = outputCanvas.getContext('webgl');
    if (!this.gl) {
      console.error('WebGL not supported');
      return;
    }
    this._initGL();
  }

  _initGL() {
    const gl = this.gl;
    gl.clearColor(0.0, 0.0, 0.0, 0.0);

    // Compile shaders.
    const vsSource = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `;
    // Simple fragment shader that composites using the mask's alpha.
    const fsSource = `
      precision lowp float;
      varying vec2 v_texCoord;
      uniform sampler2D u_video;
      uniform sampler2D u_mask;
      uniform sampler2D u_background;
      void main() {
        vec4 videoColor = texture2D(u_video, v_texCoord);
        float maskAlpha = texture2D(u_mask, v_texCoord).a;
        vec4 bgColor = texture2D(u_background, v_texCoord);
        gl_FragColor = mix(bgColor, videoColor, maskAlpha);
      }
    `;
    const vertexShader = this._compileShader(gl.VERTEX_SHADER, vsSource);
    const fragmentShader = this._compileShader(gl.FRAGMENT_SHADER, fsSource);
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Shader program error: ' + gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);
    this.program = program;

    // Get attribute and uniform locations.
    this.positionLocation = gl.getAttribLocation(program, 'a_position');
    this.texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');
    this.uVideoLocation = gl.getUniformLocation(program, 'u_video');
    this.uMaskLocation = gl.getUniformLocation(program, 'u_mask');
    this.uBackgroundLocation = gl.getUniformLocation(program, 'u_background');

    // Create a full-screen quad.
    const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    // Create texture coordinates.
    const texCoords = new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]);
    this.texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);

    // Create textures and allocate storage once.
    this.videoTexture = this._createTexture();
    this.maskTexture = this._createTexture();
    this.backgroundTexture = this._createTexture();

    // Allocate initial texture storage.
    const width = this.canvas.width;
    const height = this.canvas.height;
    gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.bindTexture(gl.TEXTURE_2D, this.backgroundTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
  }

  _compileShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error: ' + gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  _createTexture() {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  /**
   * Update an existing texture with new content using texSubImage2D.
   * Assumes the texture storage has already been allocated.
   */
  _updateTexture(texture, source) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  render() {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Update textures with current data.
    this._updateTexture(this.videoTexture, this.video);
    this._updateTexture(this.maskTexture, this.maskSource);
    this._updateTexture(this.backgroundTexture, this.backgroundSource);

    // Set up vertex attributes.
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(this.positionLocation);
    gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.enableVertexAttribArray(this.texCoordLocation);
    gl.vertexAttribPointer(this.texCoordLocation, 2, gl.FLOAT, false, 0, 0);

    // Bind textures to texture units.
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);
    gl.uniform1i(this.uVideoLocation, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
    gl.uniform1i(this.uMaskLocation, 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.backgroundTexture);
    gl.uniform1i(this.uBackgroundLocation, 2);

    // Draw the full-screen quad.
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
