let capture;

let lineSpacing = 5; // space between each horizontal line
let lineResolution = 2; // peak at every X horizontal pixels
let lineMaxPeakHeight = 70; // highest allowed peaks for each line
let lineHeightScale; // how much to scale each rgb value to map to the max peak height
let renderWidthScale; // how much we scale the webcam to the output render
let renderHeightScale; // how much we scale the webcam to the output render

let ui; // a div to contain any UI elements
let uiIdleTimeout = 5000; // number of milliseconds of inactivity before the ui fades out
let idleTimer;


let lineSpacingSlider;
let lineResolutionSlider;
let lineMaxPeakHeightSlider;

let normalCurve = []; // the artwork's peaks are higher in the middle than the edges
let curveStrength = 1.0; // how much the curve affects the overall image
let curveDeviation = 0.15; // normal curve std deviation (how thick/thin the curve is)


let curveStrengthSlider;
let curveDeviationSlider;

let widthCrop = 0.75; // how much to crop the sides to make it more rectangular
let widthCropSlider;
let startX=0; // if width cropping, where to start our drawing
let endX=480; // if width cropping, where to end our drawing

let centreScaling = 0.75; // how large our lines are within a black boundary
let centreScalingSlider;
let scalePointX;
let scalePointY;


let takeSnapshotWidget; // button to let the user save the canvas as an image

function setup() {
  createCanvas(window.innerWidth, window.innerHeight);
  capture = createCapture({
    audio: false,
    video: {
      facingMode: "user"
    }
  }, captureLoaded);

  
  capture.hide();

  lineHeightScale = lineMaxPeakHeight / 255;


  strokeWeight(2);
  
  if (isMobileDevice()) {
    //strokeWeight(1); // leave it
    // we'll narrow it, cheekily assume its portrait
    widthCrop = 0.95;
  }

  // I can barely tell the difference at these scales
  strokeCap(ROUND);
  strokeJoin(ROUND);

  ui = createDiv();
  ui.class("ui");

  lineSpacingSlider = createSlider(1, 50, lineSpacing); // must be int
  lineSpacingSlider.position(10, 10);
  lineSpacingSlider.input(onLineSpacingSliderChanged);
  // these one liners.. shame 🔔
  createP("line spacing").parent(ui).position(lineSpacingSlider.x+lineSpacingSlider.width+10, 0);
  lineSpacingSlider.parent(ui);

  lineResolutionSlider = createSlider(1, 50, lineResolution);
  lineResolutionSlider.position(10, 60);
  lineResolutionSlider.input(onLineResolutionSliderChanged);
  // shame 🔔
  createP("sample spacing").parent(ui).position(lineResolutionSlider.x+lineResolutionSlider.width+10, 45);
  lineResolutionSlider.parent(ui);

  lineMaxPeakHeightSlider = createSlider(0, 255, lineMaxPeakHeight);
  lineMaxPeakHeightSlider.position(10, 110);
  lineMaxPeakHeightSlider.input(onLineMaxPeakHeightSliderChanged);
  // shame 🔔
  createP("peak height").parent(ui).position(lineMaxPeakHeightSlider.x+lineMaxPeakHeightSlider.width+10, 95);
  lineMaxPeakHeightSlider.parent(ui);

  curveStrengthSlider = createSlider(0.0, 2.0, curveStrength, 0); // note step 0
  curveStrengthSlider.position(10, 160);
  curveStrengthSlider.input(onCurveStrengthSliderChanged);
  // shame 🔔
  createP("centre strength").parent(ui).position(curveStrengthSlider.x+curveStrengthSlider.width+10, 145);
  curveStrengthSlider.parent(ui);

  curveDeviationSlider = createSlider(0.0, 0.25, curveDeviation, 0); // TODO funny aliasing at higher values
  curveDeviationSlider.position(10, 210);
  curveDeviationSlider.input(onCurveDeviationSliderChanged);
  // shame 🔔
  createP("centre falloff").parent(ui).position(curveDeviationSlider.x+curveDeviationSlider.width+10, 195);
  curveDeviationSlider.parent(ui);

  centreScalingSlider = createSlider(0, 1, centreScaling,0);
  centreScalingSlider.position(10, 260);
  centreScalingSlider.input(onCentreScalingSliderChanged);
  // shame 🔔
  createP("scale %").parent(ui).position(centreScalingSlider.x+centreScalingSlider.width+10, 245);
  centreScalingSlider.parent(ui);
  
  widthCropSlider = createSlider(0.6, 1, widthCrop,0);
  widthCropSlider.position(10, 310);
  widthCropSlider.input(onWidthCropSliderChanged);
  widthCropSlider.parent(ui);
  // shame 🔔
  createP("width %").parent(ui).position(widthCropSlider.x+widthCropSlider.width+10, 295);
  centreScalingSlider.parent(ui);
  
  // these one liners.. shame 🔔
  createP("controls will hide after 5 seconds").parent(ui).position(centreScalingSlider.x, 340);
  
  takeSnapshotWidget = createButton("Save Image 📷");
  takeSnapshotWidget.position(canvas.width / 2, canvas.height - 50);
  takeSnapshotWidget.parent(ui);
  takeSnapshotWidget.mousePressed(takeSnapshot);

    
  fill(0, 0, 0);
  stroke(255,255,255);
}

window.onload = resetIdleTimer;
document.onkeypress = resetIdleTimer;
document.onmousedown = resetIdleTimer;
document.oninput = resetIdleTimer;

function resetIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(fadeOutUI, uiIdleTimeout);
  fadeInUI();
}

function fadeInUI() {
  ui.show();
}

function fadeOutUI() {
  ui.hide();
}


function onLineSpacingSliderChanged() {
  lineSpacing = lineSpacingSlider.value();
}

function onLineResolutionSliderChanged() {
  lineResolution = lineResolutionSlider.value();
  // also update bell curve as width has been affected
  computeNormalCurve();
}

function onLineMaxPeakHeightSliderChanged() {
  lineHeightScale = lineMaxPeakHeightSlider.value() / 255;
}

function onCurveStrengthSliderChanged() {
  curveStrength = curveStrengthSlider.value();
}

function onCurveDeviationSliderChanged() {
  curveDeviation = curveDeviationSlider.value();
  // recalculate the normal curve
  computeNormalCurve();
}

function onCentreScalingSliderChanged(){
  centreScaling = centreScalingSlider.value();
  
  // to crop the image within a boundary we need to find the origin
  // it's a point "centreScaling" along the canvas centre to 0,0
  // TODO might be better maths to do this
  scalePointX = ((1 - centreScaling) * (canvas.width*0.5)/displayDensity());
  scalePointY = ((1 - centreScaling) * (canvas.height*0.5)/displayDensity());
}

function onWidthCropSliderChanged(){
  widthCrop = widthCropSlider.value(); 
  
  startX = Math.floor(((capture.width)) * (1-widthCrop));
  endX = Math.floor(((capture.width)) * (widthCrop));
}

function isMobileDevice() {
  return (typeof window.orientation !== "undefined") || (navigator.userAgent.indexOf('IEMobile') !== -1);
};

let captureHasLoaded;
let captureHasProperlyResized;
function captureLoaded() {
  console.log("capture loaded at " + capture.width + ", " + capture.height);
  
  captureHasLoaded = true;
  // add a listener to the video element when metadata is ready
  capture.elt.addEventListener('loadedmetadata', (event) => {
    resizeCaptureAgain();
  });
  windowResized();
}
function resizeCaptureAgain() {
  console.log("capture properly loaded at " + capture.width + ", " + capture.height);
  captureHasProperlyResized=true;  
  captureLoaded();
}

function windowResized() {
  resizeCanvas(window.innerWidth, window.innerHeight);
  // display density very important for mobile devices!
  // canvas size will differ to what is expected, it will "overreport"
  // desktops are 1x, phones > 1x
  // note: we must also divide by this display density whenever referencing canvas size
  renderWidthScale = (canvas.width / capture.width) / displayDensity();
  renderHeightScale = (canvas.height / capture.height) / displayDensity();
  
  // to crop the image within a boundary we need to find the origin
  // it's a point "centreScaling" along the canvas centre to 0,0
  // TODO might be better maths to do this
  scalePointX = ((1 - centreScaling) * (canvas.width*0.5)/displayDensity());
  scalePointY = ((1 - centreScaling) * (canvas.height*0.5)/displayDensity());
  
  // the left point if cropping in from the edge
  startX = Math.floor(((capture.width)) * (1-widthCrop));
  // the right point if cropping in from the edge
  endX = Math.floor(((capture.width)) * (widthCrop));
  
  // reposition any widgets
  takeSnapshotWidget.position((window.innerWidth*0.5)-takeSnapshotWidget.width*0.5, window.innerHeight - 50);

  // manually trigger some updates
  computeNormalCurve();
}


function computeNormalCurve() {
  var newLength = capture.width / lineResolution; // how many line sections we render  
  var newStep = 1 / newLength; 
  for (var i = 0; i < newLength; i++) {
    normalCurve[i] = getGaussianFunction(0.5, curveDeviation, 1, newStep * i);
  } 
}

// refactored from https://codepen.io/Art2B/pen/BLmyzx
getGaussianFunction = function(mean, standardDeviation, maxHeight, x) {
  mean = defaultTo(mean, 0.0);
  standardDeviation = defaultTo(standardDeviation, 1.0);
  maxHeight = defaultTo(maxHeight, 1.0);

  return maxHeight * Math.pow(Math.E, -Math.pow(x - mean, 2) / (2 * (standardDeviation * standardDeviation)));

};

function defaultTo(value, defaultValue) {
  return isNaN(value) ? defaultValue : value;
}

function draw() {
  background(0);
  
  capture.loadPixels();
  // blur before edge detection
  //filter(BLUR);
  // apply prewitt filter to find edges
  // TODO offload this to webgl 
  // TODO if lineResolution high we might go "over" an edge and it wont be drawn
  //apply_prewitt_filter(capture);

  // draw a joyplot based on the brightness of the image
  // brighter pixels = higher peaks
  // for each horizonal line going downwards
  for (var y = 0; y < capture.height; y += lineSpacing) {
    // begin the line
    beginShape();
    // we need to add a little "base" below the line
    // so that it when it is filled it doesnt self intersect/overlap
    // like this:
    //  __/\___/\___/\/\/\____/\/\/\______/\/\/\/\  line
    // |__________________________________________| base
    
    // we need to include 2 vertices on either side 1px below where the line should be
    // but the line depends on the pixel intensity and we dont know that yet!
    // so unfortunately we have to duplicate some code for the edges.    
    // TODO we need the base edges, but I dont like how it looks
    // might be a way to crop/obscure it, I dont think the stroke color can be changed
    
    [i,j] = plot(startX,y,0);
    let leftY = j;
    vertex(i,j+1); // 1px below    

    let xCounter=1;
    let x=0; //could start at startX, but would have to start at correct xCounter
    
    // for each horizontal line section
    for (; x < endX; x += lineResolution) { 
      if (x > startX){
        [i,j] = plot(x,y,xCounter);
        vertex(i,j);
      }
      xCounter++;
    }
    
    // add the right hand "base"
    [i,j] = plot(endX,y,xCounter);
    vertex(i,leftY+1); // 1px below
  
    // end the line
    endShape();
  }
}

// extension to format a date object as..
Object.defineProperty(Date.prototype, 'YYYYMMDDHHMMSS', {
  value: function() {
    function pad2(n) { // always returns a string
      return (n < 10 ? '0' : '') + n;
    }

    return this.getFullYear() +
      pad2(this.getMonth() + 1) +
      pad2(this.getDate()) +
      pad2(this.getHours()) +
      pad2(this.getMinutes()) +
      pad2(this.getSeconds());
  }
});

// TODO might be more efficient way to return two variables
function plot(x,y,xIndex){  
  var i = x + y * capture.width;
  return [scalePointX + (x * renderWidthScale)*centreScaling, 
          scalePointY + ((y - (capture.pixels[4 * i] ) * (normalCurve[xIndex] * curveStrength) * lineHeightScale) * renderHeightScale)* centreScaling];
}

// save the canvas as a timestamped jpg
function takeSnapshot() {
  saveCanvas("unknownpleasures_" + new Date().YYYYMMDDHHMMSS(), "jpg");
}

// js prewitt filter:
// https://www.rand-on.com/projects/2018_edge_detection/edge_detection.html
// this should be ported to webgl, its very heavy in purejs

// Prewitt
var xKernel = [
  [-1, 0, 1],
  [-1, 0, 1],
  [-1, 0, 1]
];
var yKernel = [
  [-1, -1, -1],
  [0, 0, 0],
  [1, 1, 1]
];

function apply_prewitt_filter() {
  var n = capture.width * capture.height;
  var sobel_array = new Uint32Array(n);

  // compute the gradient in soble_array
  var index;
  var x, y;
  var xk, yk;
  var xGradient, xMultiplier;
  var yGradient, yMultiplier;
  var pixelValue;
  for (x = 1; x < capture.width - 1; x += 1) {
    for (y = 1; y < capture.height - 1; y += 1) {
      i = x + y * capture.width;
      xGradient = 0;
      yGradient = 0;
      for (xk = -1; xk <= 1; xk++) {
        for (yk = -1; yk <= 1; yk++) {
          pixelValue = capture.pixels[4 * ((x + xk) + (y + yk) * capture.width)];
          xGradient += pixelValue * xKernel[yk + 1][xk + 1];
          yGradient += pixelValue * yKernel[yk + 1][xk + 1];
        }
      }
      sobel_array[i] = Math.sqrt(
        Math.pow(xGradient, 2) + Math.pow(yGradient, 2)
      );
    }
  }

  // copy sobel_array to image pixels;
  for (x = 0; x < capture.width; x += 1) {
    for (y = 0; y < capture.height; y += 1) {
      i = x + y * capture.width;
      capture.pixels[4 * i] = sobel_array[i];
      capture.pixels[4 * i + 1] = sobel_array[i];
      capture.pixels[4 * i + 2] = sobel_array[i];
    }
  }
  capture.updatePixels();
}