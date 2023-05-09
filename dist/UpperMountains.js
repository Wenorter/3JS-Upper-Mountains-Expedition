import * as THREE from 'three';
import {GUI} from '../build/dat.gui.module.js';
import {FirstPersonControls} from '../build/FirstPersonControls.js';
import {DragControls} from '../build/DragControls.js';
import {EffectComposer} from '../build/EffectComposer.js';
import {RenderPass} from '../build/RenderPass.js';
import {FilmPass} from '../build/FilmPass.js';
import {makeItGrain} from '../build/GrainPass.js';
import {FBXLoader} from '../build/FBXLoader.js';

//===========================================
//=======Upper Mountains Expidition==========
//===========================================

//Description: You are lost member crew in the Upper Mountains.
//Wander and explore the surroundings.

//Render
let container;
let camera, controls, scene;
let renderer, composer;

//Ambient Light
var ambLight;

//Render Passes
var filmPass;
var noiseDensity, grayScale;

//Flare
var flare, flareLight;

//Drag Controls
let dragObjects = [];

//Ammo Physics variables
//For world physics
let collisionConfiguration;
let dispatcher;
let broadphase;
let solver;
let physicsWorld;
let rigidBodies = [];

let cloneAmmo, tempTransform;

//Delta Time
const clock = new THREE.Clock();

//Loading Screen 
const loadingManager = new THREE.LoadingManager();
const progressBar = document.getElementById('progress-bar');
loadingManager.onProgress = function(url, loaded, total)
{
    progressBar.value = (loaded / total) * 100;
    console.log(`Started loading: ${url}`);
}

const progressBarContainer = document.querySelector(".progress-bar-container");
loadingManager.onLoad = function(){
    progressBarContainer.style.display = "none";
}

//Raycaster
//For picking up objects
const raycaster = new THREE.Raycaster();
const clickMouse = new THREE.Vector2();
var draggable = new THREE.Object3D();

//========DEBUG===========
init();
startAmmo();
loadRadioTower();
loadBroadcastTower();
loadWaterTower()
loadOrganGun();
loadGui();
animate();
//========================

//Scene Init
function init() 
{
    //Container
    container = document.getElementById('container');
     
    //Camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 10000);
    //spawn position near radio tower stairs
    camera.position.set(-81, -1150, 135); 
    camera.name = "player";
    makeItGrain(THREE, camera);

    //Scene
    scene = new THREE.Scene();
    scene.background  = new THREE.Color();
    scene.fog = new THREE.FogExp2();

    //Ambient Light
    ambLight = new THREE.AmbientLight();
    scene.add(ambLight);

    //Flare Light
    flareLight = new THREE.SpotLight(new THREE.Color('red'), 10, 300);
    flareLight.visible = false;
    flareLight.castShadow = true;
    scene.add(flareLight);
    camera.add(flareLight.target);
    flareLight.target.position.set(0, 0, -1);

    //Renderer
    renderer = new THREE.WebGLRenderer();
    renderer.antialias = true;
    renderer.precision = "highp";
    renderer.powerPreference = "high-performance";
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    //Effect Composer
    composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
   
    //Noise Grain
    //This filter reduces colour setting the image to be more grayscale 
    //This one goes really well with winter scenery
    filmPass = new FilmPass(noiseDensity, 0, 0, grayScale);
    composer.addPass(filmPass);

    //First Person Controls
    controls = new FirstPersonControls(camera, renderer.domElement);
    controls.movementSpeed = 150;
    controls.lookSpeed = 0.05;

    //Drag Conrols
    const dragControls = new DragControls(dragObjects, camera, renderer.domElement);
    dragControls.activate();
}

window.addEventListener('resize', onWindowResize());
function onWindowResize() 
{
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
    controls.handleResize();
}

window.addEventListener('resize', initRaycaster());
function initRaycaster()
{
    window.addEventListener('click', event => {
        clickMouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        clickMouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
        const found = raycaster.intersectObjects(scene.children);
        console.log("Raycasting!");
        console.log(raycaster);
    
        if (found.length > 0 && found[0].object.userData.draggable)
        {
            //draggable = found[0].object;
            //console.log(`${draggable.userData.name} found!`);
        }
    });
}

window.addEventListener('click', () => {PlayAudio()}, {once: true });
function PlayAudio(){
//Music
const listener = new THREE.AudioListener();
camera.add(listener);

const audioLoader = new THREE.AudioLoader();
const backgroundMusic = new THREE.Audio(listener);

audioLoader.load("../music/Alberich - Upper Mountains.mp3", function(buffer)
{
    backgroundMusic.setBuffer(buffer);
    backgroundMusic.setLoop(true);
    backgroundMusic.setVolume(0.05);
    backgroundMusic.play();
});
}

//Ammo physics init
function startAmmo(){
    Ammo().then((lib) => {
        Ammo = lib;
        cloneAmmo = lib;
        tempTransform = new cloneAmmo.btTransform();

        //Setup physics world
        collisionConfiguration = new Ammo.btDefaultCollisionConfiguration();
        dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration);
        broadphase = new Ammo.btDbvtBroadphase();
        solver = new Ammo.btSequentialImpulseConstraintSolver();
    
        physicsWorld = new Ammo.btDiscreteDynamicsWorld(dispatcher, broadphase, solver, collisionConfiguration);
        physicsWorld.setGravity(new Ammo.btVector3(0, -8, 0));
        console.log("Physics World Initialised!");

        //testObjects
        addTestSphere();
        loadMountain();
        loadFlare();

        console.log("Ammo started!");
    })
}

//https://github.com/kripken/ammo.js/issues/304
//This one was created because I want to use collision box shape,
//which wraps around the object like somekind of collison box skin.
//I use it because square collision box on mountain terrain is a bad technical decision.
//Terrains are not flat like plane collision box.
function createPhysicsMeshFromGeometry(geometry) {

    const triangleMesh = new Ammo.btTriangleMesh();

    const vectA = new Ammo.btVector3(0, 0, 0);
    const vectB = new Ammo.btVector3(0, 0, 0);
    const vectC = new Ammo.btVector3(0, 0, 0);

    const verticesPos = geometry.getAttribute('position').array;
    const triangles = [];
    for (let i = 0; i < verticesPos.length; i += 3) {
        triangles.push({
                x: verticesPos[i],
                y: verticesPos[i + 1],
                z: verticesPos[i + 2]
        })
    }

    for (let i = 0; i < triangles.length - 3; i += 3) {
        vectA.setX(triangles[i].x);
        vectA.setY(triangles[i].y);
        vectA.setZ(triangles[i].z);

        vectB.setX(triangles[i + 1].x);
        vectB.setY(triangles[i + 1].y);
        vectB.setZ(triangles[i + 1].z);

        vectC.setX(triangles[i + 2].x);
        vectC.setY(triangles[i + 2].y);
        vectC.setZ(triangles[i + 2].z);

        triangleMesh.addTriangle(vectA, vectB, vectC, true);
    }

    let shape = new Ammo.btBvhTriangleMeshShape(triangleMesh, true);
    geometry.verticesNeedUpdate = true
    shape.setMargin(0.05);

    return shape;
}

function addTestSphere(){

    let radius = 10;
    let margin = 0.05;
    let mass = 1;

    let ball = new THREE.Mesh(new THREE.SphereGeometry(radius), new THREE.MeshPhongMaterial({color: 0xff0000}));
    ball.position.set(-200, -500, -200);
    ball.castShadow = true;
    ball.recieveShadow = true;

    scene.add(ball);
   
    
    //Ball physics
    let transform = new Ammo.btTransform();
    transform.setIdentity();

    //setting mountain 3D World parameters to Physics world
    transform.setOrigin(new Ammo.btVector3(ball.position.x, ball.position.y, ball.position.z));
    transform.setRotation(new Ammo.btQuaternion(ball.rotation.x, ball.rotation.y, ball.rotation.z));

    let motionState = new Ammo.btDefaultMotionState(transform);
    
    let localInertia = new Ammo.btVector3(0, 0, 0);
    
    //Collision box shape
    let shape = new Ammo.btSphereShape(radius);
    shape.setMargin(margin);
    shape.calculateLocalInertia(mass, localInertia); //mass, localInertia

    //Rigid Body
    let rigidBodyInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, shape, localInertia);
    let rBody = new Ammo.btRigidBody(rigidBodyInfo);

    physicsWorld.addRigidBody(rBody);
    ball.userData.physicsBody = rBody;
    rigidBodies.push(ball);

    console.log("Test sphere added!");
}

function loadMountain()
{
    const fbxLoader = new FBXLoader(loadingManager);

    fbxLoader.load("../model/SnowyMountain.fbx", function(mountain)
        {
            const textureLoader = new THREE.TextureLoader();
            const diffuseTexture = textureLoader.load("../textures/snowy_mountain/diffuse.png");
            const normalTexture = textureLoader.load("../textures/snowy_mountain/normal.png");
            const roughTexture = textureLoader.load("../textures/snowy_mountain/glossiness.png");
            const metallicTexture = textureLoader.load("../textures/snowy_mountain/metallic.png");
            const heightTexture = textureLoader.load("../textures/snowy_mountain/height.png");

            mountain.traverse(function(child){
                if (child.isMesh) 
                {        
                  child.castShadow = true;
                  child.receiveShadow = true;
                  child.material.map = diffuseTexture;
                  child.material.normalMap = normalTexture;
                  child.material.roughnessMap = roughTexture;
                  child.material.roughnessMap = metallicTexture;
                  child.material.displacementMap = heightTexture;
                  child.material.displacementScale = 0.1;                                 
                }
              } 
            );

            mountain.userData.name = "Mountain";
            mountain.scale.setScalar(150);
            mountain.receiveShadow = true;
            //mountain.userData.ground = true;
            scene.add(mountain);

            //Ammo Physics
            let mass = 0;
            let margin = 0.05;

            let transform = new Ammo.btTransform();
            transform.setIdentity();

            //setting 3D World parameters to Physics world
            transform.setOrigin(new Ammo.btVector3(mountain.position.x, mountain.position.y, mountain.position.z));
            transform.setRotation(new Ammo.btQuaternion(mountain.rotation.x, mountain.rotation.y, mountain.rotation.z));

            let motionState = new Ammo.btDefaultMotionState(transform);
            let localInertia = new Ammo.btVector3(0, 0, 0);

            //btBoxShape is rigid body collision box
            let shape = new Ammo.btBoxShape(new Ammo.btVector3(mountain.scale.x * 0.5, mountain.scale.y * 0.5, mountain.scale.z * 0.5));
            shape.setMargin(margin);
            shape.calculateLocalInertia(mass, localInertia); 

            //Rigid Body
            let rigidBodyInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, shape, localInertia);
            let rBody = new Ammo.btRigidBody(rigidBodyInfo);

            //let model = mountain.children[0];
            //let geometry = model.geometry;
            //let rBody = createPhysicsBodyFromGeometry(geometry);

            physicsWorld.addRigidBody(rBody);
            console.log("Mountain Added!");
        }
    );
}

function loadRadioTower()
{
    //there are two radio tower models
    //this one is old soviet radio tower with stairs and building at the base
    const fbxLoader = new FBXLoader(loadingManager);
    fbxLoader.load("../model/SovietRadioTower.fbx", (radioTower) =>
        {
            const textureLoader = new THREE.TextureLoader();
            const diffuseTexture = textureLoader.load("../textures/soviet_radio_tower/diffuse.png");
            const normalTexture = textureLoader.load("../textures/soviet_radio_tower/normal.png");
            const roughTexture = textureLoader.load("../textures/soviet_radio_tower/roughness.png");
            const metallicTexture = textureLoader.load("../textures/soviet_radio_tower/metallic.png");
            const aoTexture = textureLoader.load("../textures/soviet_radio_tower/ao.png");

            radioTower.traverse(function(child){
                if (child.isMesh) 
                {        
                  child.castShadow = true;
                  child.receiveShadow = true;
                  child.material.map = diffuseTexture;
                  child.material.normalMap = normalTexture;
                  child.material.roughnessMap = roughTexture;
                  child.material.metalnessMap = metallicTexture;
                  child.material.aoMap = aoTexture;        
                }
              } 
            );

            radioTower.userData.name = "Radio Tower";
            radioTower.position.set(0, -1320, 0);
            radioTower.scale.setScalar(0.5);
            radioTower.castShadow = true;
            scene.add(radioTower);
        }
    );
}

function loadBroadcastTower()
{
    //there are two radio tower models
    //this one is telecommunications antenna tower
    const fbxLoader = new FBXLoader(loadingManager);
    //all textures are imported as part of .fbx material settings
    fbxLoader.setResourcePath("../textures/broadcast_tower/");
    fbxLoader.load("../model/BroadcastTower.fbx", (broadcastTower) =>
        {          
            broadcastTower.traverse(function(child){
                if (child.isMesh) 
                {        
                  child.castShadow = true;
                  child.receiveShadow = true;
                }
              } 
            );

            broadcastTower.userData.name = "Broadcast Tower";
            broadcastTower.position.set(-2790, -1530, -550);
            broadcastTower.scale.setScalar(0.5);
            //player spawns looking at broadcast tower in the distance
            camera.lookAt(broadcastTower);
            scene.add(broadcastTower);
        }
    );
}

function loadWaterTower()
{
    const fbxLoader = new FBXLoader(loadingManager);
    //all textures are imported as part of .fbx material settings
    fbxLoader.setResourcePath("../textures/water_tower/");
    fbxLoader.load("../model/WaterTower.fbx", (waterTower) =>
        {         
            waterTower.traverse(function(child){
                if (child.isMesh) 
                {        
                  child.castShadow = true;
                  child.receiveShadow = true;
                }
              } 
            );

            waterTower.userData.name = "Water Tower";
            waterTower.position.set(-4430, -1570, -2870);
            //waterTower.rotation.set(0, -270, -0);
            waterTower.scale.setScalar(1);
            scene.add(waterTower);
        }
    );
}

function loadOrganGun()
{
    const fbxLoader = new FBXLoader(loadingManager);
    fbxLoader.setResourcePath("../textures/organ_gun/");
    fbxLoader.load("../model/OrganGun.fbx", (organGun) =>
        {         
            organGun.traverse(function(child){
                if (child.isMesh) 
                {        
                  child.castShadow = true;
                  child.receiveShadow = true;
                }
              } 
            );

            organGun.userData.name = "Organ gun";
            organGun.position.set(0, -1500, -2500);
            organGun.rotation.set(0, -270, -0);
            organGun.scale.setScalar(5);
            scene.add(organGun);
        }
    );
}

function loadFlare()
{
    const fbxLoader = new FBXLoader(loadingManager);
    fbxLoader.setResourcePath("../textures/flare/");
    fbxLoader.load("../model/Flare.fbx", (flare) =>
        {         
            flare.traverse(function(child){
                if (child.isMesh) 
                {        
                  child.castShadow = true;
                  child.receiveShadow = true;
                }
              } 
            );

            //equip the flare
            addEventListener("dblclick", (event) => {

                clickMouse.x = (event.clientX / window.innerWidth) * 2 - 1;
                clickMouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
            
                flare.visible = false;
                flareLight.visible = true;
            });

            //drop the flare
            window.addEventListener('contextmenu', (event) => {

                clickMouse.x = (event.clientX / window.innerWidth) * 2 - 1;
                clickMouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
                
                flare.position.set(camera.position.x, camera.position.y, camera.position.z);
                flare.visible = true;
                flareLight.visible = false;
                
            });

            //var min = geometry.boundingBox.min;
            flare.userData.name = "Flare";
            flare.userData.draggable = true;
            flare.position.set(-600, -1340, 130);
            flare.scale.setScalar(0.01);   
            
            scene.add(flare);
            dragObjects.push(flare);

            //Ammo Physics
            /*let mass = 1;
            let margin = 0.05;

            let transform = new Ammo.btTransform();
            transform.setIdentity();

            //setting mountain 3D World parameters to Physics world
            transform.setOrigin(new Ammo.btVector3(flare.position.x, flare.position.y, flare.position.z));
            transform.setRotation(new Ammo.btQuaternion(flare.rotation.x, flare.rotation.y, flare.rotation.z));;

            let motionState = new Ammo.btDefaultMotionState(transform);
            
            let localInertia = new Ammo.btVector3(0, 0, 0);
            
             //btBoxShape is rigid body collision box
             let shape = new Ammo.btBoxShape(new Ammo.btVector3(flare.scale.x * 0.5, flare.scale.y * 0.5, flare.scale.z * 0.5));
             shape.setMargin(margin);
             shape.calculateLocalInertia(mass, localInertia); 

            //Rigid Body
            let rigidBodyInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, shape, localInertia);
            let rBody = new Ammo.btRigidBody(rigidBodyInfo);

            physicsWorld.addRigidBody(rBody);
            flare.userData.physicsBody = rBody;
            rigidBodies.push(flare);*/
        }
    );   
}

function loadGui()
{
    //Parameters
    //https://snayss.medium.com/three-js-fog-hacks-fc0b42f63386

    var fogParams = {
        fogColor: 0xffffff,
        fogDensity: 0.0025,
    };

    var ambLightParams = {
        ambLightColour: 0xffffff,
        ambLightInten: 0.001
    }

    var filmPassParams = {
        noiseDensity: 0,
        grayScale: 1 //when filmPass loads grayscale is enabled by default
    }

    var dayCycleParams = {
        dawnCycle: false,
        dayCycle: false,
        duskCycle: false,
        nightCycle: false
    }

    const gui = new GUI();
     //colour change
    let fogFolder = gui.addFolder("Fog Weather Control");
    fogFolder.addColor(fogParams, "fogColor").name("Fog Colour").onChange(function(){
        scene.fog.color.set(fogParams.fogColor);
        scene.background = new THREE.Color(fogParams.fogColor);
    });
    fogFolder.add(fogParams, "fogDensity", 0, 0.01).name("Fog Density").onChange(function(){
        scene.fog.density = fogParams.fogDensity;
    });

    let lightFolder = gui.addFolder("Ambient Light Control");
    lightFolder.addColor(ambLightParams, "ambLightColour").name("AL Colour").onChange(() => 
    {
        ambLight.color.setHex(ambLightParams.ambLightColour);
    });
    lightFolder.add(ambLightParams, "ambLightInten", 0, 1, 0.005).name("AL Intensity").onChange(() =>
    {
        ambLight.intensity = ambLightParams.ambLightInten;
    });

    //https://subscription.packtpub.com/book/web-development/9781784392215/11/ch11lvl1sec55/postprocessing-passes
    let filmpassFolder = gui.addFolder("Film Pass Effect Control");
    filmpassFolder.add(filmPassParams, "noiseDensity", 0, 1, 0.005).name("Noise Grain Density").onChange(function(){
        
        filmPass.uniforms.nIntensity.value = filmPassParams.noiseDensity;
    });
    filmpassFolder.add(filmPassParams, "grayScale", 0, 1, 1).name("Grayscale Filter").onChange(function(){
        filmPass.uniforms.grayscale.value = filmPassParams.grayScale;
    });

    let daycycleFolder = gui.addFolder("Day Cycle Control");
    daycycleFolder.add(dayCycleParams, "dawnCycle").name("Dawn").onChange(function(){

        if (dayCycleParams.dawnCycle)
        {
            filmPass.uniforms.nIntensity.value = 0.5;
            scene.background.set(0xc38170);
            scene.fog.color.set(0xc38170);
            ambLight.color.setHex(0xb0e3ff);
        }
        else
        {
            filmPass.uniforms.nIntensity.value = 0.0;
            scene.background.set(0xffffff);
            scene.fog.color.set(0xffffff);
            ambLight.color.setHex(0xffffff);
        }
    });

    daycycleFolder.add(dayCycleParams, "dayCycle").name("Day").onChange(function(){

        if (dayCycleParams.dayCycle)
        {
            filmPass.uniforms.nIntensity.value = 1.0;
            scene.background.set(0xb19f80);
            scene.fog.color.set(0xb19f80);
            ambLight.color.setHex(0xdec4ad);
        }
        else
        {
            filmPass.uniforms.nIntensity.value = 0.0;
            scene.background.set(0xffffff);
            scene.fog.color.set(0xffffff);
            ambLight.color.setHex(0xffffff);
        }
    });

    daycycleFolder.add(dayCycleParams, "duskCycle").name("Dusk").onChange(function(){

        if (dayCycleParams.duskCycle)
        {
            filmPass.uniforms.nIntensity.value = 0.5;
            scene.background.set(0x504343);
            scene.fog.color.set(0x504343);
            ambLight.color.setHex(0x8986a2);
        }
        else
        {
            filmPass.uniforms.nIntensity.value = 0.0;
            scene.background.set(0xffffff);
            scene.fog.color.set(0xffffff);
            ambLight.color.setHex(0xffffff);
        }
    });
    daycycleFolder.add(dayCycleParams, "nightCycle").name("Night").onChange(function(){

        if (dayCycleParams.nightCycle)
        {
            filmPass.uniforms.nIntensity.value = 0.0;
            scene.background.set(0x1c2334);
            scene.fog.color.set(0x1c2334);
            ambLight.color.setHex(0x7cc1d7);
        }
        else
        {
            filmPass.uniforms.nIntensity.value = 0.0;
            scene.background.set(0xffffff);
            scene.fog.color.set(0xffffff);
            ambLight.color.setHex(0xffffff);
        }      
    });
}

function animate() 
{
    requestAnimationFrame(animate);
    render();
    flareLight.position.copy(camera.position);
    raycaster.setFromCamera(clickMouse, camera);

    if(physicsWorld)
    {
        updatePhysics(clock.getDelta());
    }
}

function updatePhysics(deltaTime)
{
    physicsWorld.stepSimulation(deltaTime, 10);

    for(let i = 0; i < rigidBodies.length; i++)
    {
        let threeObject = rigidBodies[i];

        let ammoObject = threeObject.userData.physicsBody;
        let ms = ammoObject.getMotionState();

        if(ms)
        {
            ms.getWorldTransform(tempTransform);
            let pos = tempTransform.getOrigin();
            let quat = tempTransform.getRotation();
            threeObject.position.set(pos.x(), pos.y(), pos.z());
            threeObject.quaternion.set(quat.x(), quat.y(), quat.z(), quat.w());
        }
    }

}

function render() 
{
    controls.update(clock.getDelta());
    composer.render(scene, camera);
}