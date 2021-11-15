let THREE;
export default class STEPLoader {

    constructor(options) {
        THREE = options.THREE;
        this.options = {
            ...options
        };
    }
    async load(url, ondone, onerror) {

        let options = {
            widthValue: "400px",
            heightValue: "300px",
            autostart: 0,
            logopath: "",
            viewtype: "model",
            background: "#cacaca",
            autostartsize: -1,
            isWidget: true,
            logopos: "br",
            fog: true,
            mirror: true,
            grid: true,
            autorotate: true,
            outline: "",
            lightcolor: 0xffaaff,
            mouse: true,
        }
        options.rootfileUri = url;
        Object.keys(this.options).forEach(k=>options[k] = this.options[k])

        if (!this.meshworkerscript) {
            async function loadLib() {
                return new Promise((resolve,reject)=>fetch('./noncomercial.r4.js').then(data=>data.text().then(txt=>resolve(txt))))
            }
            let library = await loadLib();

            this.meshworkerscript = `//var document = {};

function onAssemblyLoaderCheck(){
    //console.log('waiting');
    //waiting for result for sync method
    if(Module && Module.StepProcessor)
    {
        postMessage({"action":"onstarted"});
        return;
    }

    setTimeout(onAssemblyLoaderCheck, 100);
}
setTimeout(onAssemblyLoaderCheck, 100);

${library}

onmessage = function(e) {
    //console.log('Worker: Message received from main script');

    var msg = e.data;
    if(msg.action == "start")
    {
        let filename = msg.fileName;
        myFunction2(filename, msg);
    }

  }

  function myFunction2(modelname, msg) {
      
    function transferFailed(evt) {
        console.log("An error occurred while transferring the file.");
    }

    function updateProgress (oEvent) {
        if (oEvent.lengthComputable) {
            var percentComplete = oEvent.loaded / oEvent.total * 100;
            //document.getElementById("loadingpercentage").innerHTML = percentComplete;
            //console.log(percentComplete);
            postMessage({"action":"fileprogress","complete":percentComplete});
        } else {
            //document.getElementById("loadingpercentage").innerHTML = 100;
            //console.log('tahame');
            postMessage({"action":"filedownloaded"});
        }
    }

    var qualityValue = msg.quality;

    var request21 = new XMLHttpRequest();
    request21.open('GET', modelname);
    //request21.responseType = 'text';//'json';
    request21.responseType = 'arraybuffer';//'json';
    request21.overrideMimeType("application/octet-stream");
    //request21.overrideMimeType("application/json");
    request21.addEventListener("error", transferFailed);
    request21.addEventListener("progress", updateProgress);
    request21.onload = function() {
        var status = this.status;
        var fileLength = request21.response.byteLength;

        //console.log('step file length: ' + fileLength);

        //time estimation
        var totalSeconds = Math.round(fileLength / (1024*1024) * 10);
        if(totalSeconds < 1) totalSeconds = 1;


        postMessage({"action":"p2configure","totalSeconds":totalSeconds, "fileLength":fileLength});

        FS.writeFile('blob1.txt', new Uint8Array(request21.response), { encoding: "binary" });

        //console.log('dtest: '+(FS.stat('/blob1.txt')).size);

        var stepProcessor = new Module.StepProcessor('/blob1.txt',3);
        var loadResult = stepProcessor.LoadFile();
        
        postMessage({"action":"p2loaded", "faceCount":loadResult});

        var tempQuality = qualityValue ? qualityValue : 1.5;
        
        //measured mapping table
        if(!qualityValue)
        {
            if (fileLength < 10 * 1024 * 1024) tempQuality = 1.0;  
            if (fileLength < 5 * 1024 * 1024) tempQuality = 0.8;                
            if (fileLength < 1024 * 1024) tempQuality = 0.75;
            if (fileLength < 500 * 1024) tempQuality = 0.66;
            if (fileLength < 100 * 1024) tempQuality = 0.4;
            if (fileLength < 50 * 1024) tempQuality = 0.25;
        }

        //console.log("quality:" + tempQuality + " fileLength:" + fileLength);

        var convertResult = stepProcessor.Convert(tempQuality,0);

        var pResult = stepProcessor.Result();

        stepProcessor.delete();//explicit destructor

        postMessage({"action":"stepresult","resultData":pResult});      
    }

    request21.send();
}
`;
            this.meshworkerscript = this.meshworkerscript.replace('XXXPATHXXX', location.href.slice(0, location.href.lastIndexOf('/') + 1))
        }

        let meshworkerscript = this.meshworkerscript;

        let initworker = function(wrapperid) {

            var workerblob = new Blob([meshworkerscript],{
                type: "application/javascript",
            });
            var workerurl = window.URL || window.webkitURL;
            var blobUrl = workerurl.createObjectURL(workerblob);
            myWorker = new Worker(blobUrl);

            myWorker.onerror = function(e) {
                console.log(e);
            }
            ;
            myWorker.onmessageerror = function(e) {
                console.log(e);
            }
            ;

            myWorker.onmessage = function(e) {
                //console.log(e);
                var msg = e.data;

                if (msg.action == "onstarted") {
                    myWorker.postMessage({
                        action: "start",
                        fileName: options.rootfileUri,
                        quality: options.quality,
                    });
                } else if (msg.action == "fileprogress") {
                    var msgstr = "Loading ... " + msg.complete + "%";
                } else if (msg.action == "filedownloaded") {
                    var msgstr = "Processing ... " + 0 + "%";

                } else if (msg.action == "p2configure") {
                    fileLength = msg.fileLength;

                    p2ProgressEnabled = true;
                } else if (msg.action == "p2loaded") {
                    p2ProgressEnabled = false;

                    var msgstr = "Rendering ... " + 0 + "%";
                    p3ProgressSecondsTotal = Math.round(fileLength / (1024 * 1024) + msg.faceCount / 50);
                    if (p3ProgressSecondsTotal == 0)
                        p3ProgressSecondsTotal = 1;

                    p3ProgressEnabled = true;
                    setTimeout(p3CountDown, 500);
                } else if (msg.action == "stepresult") {
                    p3ProgressEnabled = false;

                    showStepData(msg.resultData);
                    myWorker.terminate()
                    ondone({
                        scene
                    })
                }
            }
            ;

            myWorker.postMessage({
                data: "123456789"
            });
        }

        //initialize end

        var mesh, renderer, scene, camera, controls;
        var wirePlane, plane, skybox, reflectCamera;
        var geometry;

        var myWorker;

        var fileLength = 0;

        var p2ProgressSecondsTotal = 0;
        var p2ProgressSeconds = 0;
        var p2ProgressEnabled = false;

        var p3ProgressSecondsTotal = 0;
        var p3ProgressSeconds = 0;
        var p3ProgressEnabled = false;

        var processStarted = false;

        var clickActive = true;

        scene = new THREE.Scene();
        scene.rotation.x = -Math.PI * .5

        initworker()

        function getCode() {
            var result = "<script";
            result += " fileuri='your-file-url' ";
            result += " width='" + options.widthValue + "' ";
            result += " height='" + options.heightValue + "' ";
            result += " background='" + lastOptions.lastBackgroundColor + "' ";
            result += " lightcolor='" + lastOptions.lastLightColor + "' ";
            result += " viewtype='" + lastOptions.lastViewType + "' ";
            result += " autostart='0' ";
            result += " autostartsize='-1' ";
            result += " fog='" + lastOptions.fog + "' ";
            result += " mirror='" + lastOptions.mirror + "' ";
            result += " grid='" + lastOptions.grid + "' ";
            result += " autorotate='" + lastOptions.autorotate + "' ";
            //result += " src='https://cdn13.3dmeshviewer.com/noncomercial.r4.js' ";
            result += " src='./noncomercial.r4.js' ";

            if (lastOptions.lastLogoUrl) {
                result += " logopath='" + lastOptions.lastLogoUrl + "' ";
                result += " logopos='" + options.logopos + "' ";
            }

            result += " ></script>";

            return result;
        }

        var lastOptions = {
            lastStepData: undefined,
            lastMaterialType: "metalic",
            lastViewType: options.viewtype,
            lastBackgroundColor: undefined,
            lastLightColor: undefined,
            lastLogoUrl: undefined,
            fog: true,
            mirror: true,
            grid: true,
            autorotate: true,
        };

        function p2CountDown() {
            if (p2ProgressEnabled) {

                p2ProgressSeconds = p2ProgressSeconds + 0.5;

                var percentage = Math.round((p2ProgressSeconds / p2ProgressSecondsTotal) * 100);

                if (percentage > 95)
                    percentage = 95;

                var calcPercentage = percentage == 0 ? 1 : percentage;

                setTimeout(p2CountDown, 500);
            }
        }

        function p3CountDown() {
            if (p3ProgressEnabled) {

                p3ProgressSeconds = p3ProgressSeconds + 0.5;

                setTimeout(p3CountDown, 500);
            }
        }

        function addModel(mesh) {
            var bbox = new THREE.Box3().setFromObject(mesh);
            /*
                var rsize = renderer.getSize(new THREE.Vector3());
                var ratioWindow = (rsize.x / rsize.y) * 0.5;

                var dims = bbox.max.clone().sub(bbox.min);
                var maxDim = Math.max(Math.max(dims.x, dims.y), dims.z);
                // console.log({ maxdim: maxDim, dims: dims });

                var scale = 100 / maxDim;

                // center object
                mesh.position.x = (-(bbox.min.x + bbox.max.x) / 2) * scale;
                mesh.position.y = (-(bbox.min.y + bbox.max.y) / 2) * scale;
                mesh.position.z = -bbox.min.z * scale;
*/

            scene.add(mesh);

        }

        var modelGroup;

        function showStepData(stepData) {
            lastOptions.lastStepData = stepData;

            if (modelGroup)
                scene.remove(modelGroup);

            var materialType = lastOptions.lastMaterialType;
            var viewType = lastOptions.lastViewType;

            var materialX = new THREE.MeshStandardMaterial({
                //envMap: textureCube,
                roughness: 0.75,
                metalness: 1,
                emissive: 0x000000,
                //color: 0xFFD700
                fog: false,
            });

            var obj2 = JSON.parse(stepData);

            var deviation = obj2.deviation;
            var scaleRatio = 2.0 / deviation;

            var line_material = new THREE.LineBasicMaterial({
                color: 0x000000,
                linewidth: 5,
                fog: false,
            });

            // var dashed_material = new THREE.LineDashedMaterial({
            //     color: 0xff0000,
            //     //linewidth: 1,
            //     //scale: 1,
            //     // dashSize: 3,
            //     // gapSize: 1,
            //     dashSize: 1,
            //     gapSize: 1,
            //     depthTest: false,
            //     fog: false,
            // });
            var lineVertShader = `
        attribute float lineDistance;
        varying float vLineDistance;       

        void main() {
          vLineDistance = lineDistance;         
          vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
          gl_Position = projectionMatrix * mvPosition;
        }
        `;

            var lineFragShader = `
        uniform vec3 diffuse;
        uniform float opacity;
      
        uniform float dashSize;
        uniform float gapSize;
        uniform float dotSize;
        varying float vLineDistance;

        void main() {         
            
           float segmentSize = dashSize;
           float segmentsCount = vLineDistance / segmentSize;

           if(mod(segmentsCount, 2.0) > 1.0)
           {
            discard;
           }

           gl_FragColor = vec4( diffuse, opacity );
        }
        `;

            var dashed_material = new THREE.ShaderMaterial({
                uniforms: {
                    diffuse: {
                        value: new THREE.Color("black")
                    },
                    dashSize: {
                        value: 2.0
                    },
                    //50
                    gapSize: {
                        value: 1
                    },
                    dotSize: {
                        value: 0.1
                    },
                    opacity: {
                        value: 0.5
                    },
                },
                vertexShader: lineVertShader,
                fragmentShader: lineFragShader,
                transparent: true,
                depthTest: false,
                fog: false,
            });

            modelGroup = new THREE.Group();

            for (var ri = 0; ri < obj2.entities.length; ri++) {
                var entity = obj2.entities[ri];

                for (var i = 0; i < entity.entityparts.length; i++) {
                    var entityPart = entity.entityparts[i];

                    if (entityPart.position.length > 0) {
                        var geometryEdge = new THREE.BufferGeometry();

                        geometryEdge.setAttribute("position", new THREE.BufferAttribute(new Float32Array(entityPart.position),3));
                        geometryEdge.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(entityPart.normal),3));
                        entityPart.uv && geometryEdge.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(entityPart.uv),2));

                        geometryEdge.setIndex(new THREE.BufferAttribute(new Uint32Array(entityPart.indice,0,3),1));

                        var curMaterial = materialX;

                        if (entityPart.colorrgb && entityPart.colorrgb != "") {
                            if (!materialType || materialType == "metalic") {
                                curMaterial = new THREE.MeshStandardMaterial({
                                    //envMap: textureCube,
                                    roughness: 0.75,
                                    metalness: 1,
                                    //1
                                    emissive: 0x000000,
                                    color: new THREE.Color(entityPart.colorrgb.R,entityPart.colorrgb.G,entityPart.colorrgb.B),
                                    fog: false,
                                });
                            } else if (materialType == "plastic") {
                                var curMaterial = new THREE.MeshPhongMaterial({
                                    wrapAround: true,
                                    wrapRGB: new THREE.Vector3(0,1,1),
                                    // color: 0x0D8DFF,
                                    color: new THREE.Color(entityPart.colorrgb.R,entityPart.colorrgb.G,entityPart.colorrgb.B),
                                    specular: 0xa0a0a0,
                                    //shading:    THREE.SmoothShading,
                                    flatShading: false,
                                    shininess: 150,
                                    fog: false,
                                    side: THREE.DoubleSide,
                                });
                            } else if (materialType == "basic") {
                                var curMaterial = new THREE.MeshLambertMaterial({
                                    color: 0x0d8dff,
                                    flatShading: false,
                                    shininess: 150,
                                    fog: false,
                                    side: THREE.DoubleSide,
                                });
                            }
                        }

                        var mesh = new THREE.Mesh(geometryEdge,curMaterial);
                        mesh.scale.set(scaleRatio, scaleRatio, scaleRatio);

                        // mesh.geometry.computeFaceNormals();
                        // mesh.geometry.computeVertexNormals();

                        if (obj2.rotation) {
                            if (obj2.rotation.x) {
                                mesh.rotation.x = obj2.rotation.x;
                            }
                            if (obj2.rotation.y) {
                                mesh.rotation.y = obj2.rotation.y;
                            }
                            if (obj2.rotation.z) {
                                mesh.rotation.z = obj2.rotation.z;
                            }
                        }

                        modelGroup.add(mesh);
                    }
                }

                //conversion is slow in javascript and it will be better to move it to c++ assembly
                if (viewType && (viewType == "outline" || viewType == "hiddenoutline")) {
                    //hiddenoutline
                    if (entity.edges) {
                        var resultLinesArray = new Array();
                        var resultIndicesArray = new Array();

                        var curPos = 0;

                        var lineDistances = [];
                        var distanceOrder = 0;

                        for (var i = 0; i < entity.edges.lines.length; i++) {
                            var lineData = entity.edges.lines[i];

                            var lastVec = undefined;
                            var d = 0;
                            //!!! slow - resultLinesArray = resultLinesArray.concat(lineData);
                            for (var subi = 0; subi < lineData.length; subi = subi + 3) {
                                resultLinesArray.push(lineData[subi]);
                                resultLinesArray.push(lineData[subi + 1]);
                                resultLinesArray.push(lineData[subi + 2]);

                                var curVec = new THREE.Vector3(lineData[subi],lineData[subi + 1],lineData[subi + 2]);

                                if (lastVec) {
                                    d += lastVec.distanceTo(curVec);

                                    lineDistances[distanceOrder] = d;
                                    distanceOrder++;
                                } else {
                                    lineDistances[distanceOrder] = d;
                                    //0
                                    distanceOrder++;
                                }

                                lastVec = curVec;
                            }

                            var indexCount = lineData.length / 3 - 1;

                            for (var j = 0; j < indexCount; j++) {
                                resultIndicesArray.push(curPos);
                                curPos++;
                                resultIndicesArray.push(curPos);
                            }
                            //prepare for next list of data
                            curPos++;
                        }

                        var geometryEdge = new THREE.BufferGeometry();
                        //new THREE.BufferGeometry();
                        var verticesEdge = new Float32Array(resultLinesArray);
                        geometryEdge.setAttribute("position", new THREE.BufferAttribute(verticesEdge,3));
                        geometryEdge.setIndex(new THREE.BufferAttribute(new Uint16Array(resultIndicesArray),1));

                        geometryEdge.setAttribute("lineDistance", new THREE.BufferAttribute(new Float32Array(lineDistances),1));

                        if (viewType == "hiddenoutline") {
                            //bug in three.js not working dashed on buffered geometry https://github.com/mrdoob/three.js/issues/8494
                            var line = new THREE.LineSegments(geometryEdge,dashed_material);
                            //var mesh = new THREE.Line(geometryEdge, dashed_material);
                            line.scale.set(scaleRatio, scaleRatio, scaleRatio);
                            line.renderOrder = 1000;
                            //line.computeLineDistances();

                            modelGroup.add(line);
                        }

                        //console.log(lineDistances);

                        var meshLine = new THREE.LineSegments(geometryEdge,line_material);
                        meshLine.scale.set(scaleRatio, scaleRatio, scaleRatio);
                        modelGroup.add(meshLine);

                        renderer.sortObjects = true;
                    }
                }
            }

            addModel(modelGroup);
        }
        return 'pending'
    }
}
