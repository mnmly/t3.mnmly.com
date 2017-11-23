import * as THREE from 'three'
import xhr from 'xhr'
import url from 'url'
import vec2 from  'gl-vec2'
import keycode from 'keycode'
import vec3 from  'gl-vec3'
import loop from 'raf-loop'
import remap from 'remap'
import { glslify } from 'glslify'
import Integrator from './lib/Integrator'
import createOBJLoader from './lib/OBJLoader'
import createOrbitControls from 'three-orbit-controls'
import Hammer from 'hammerjs'

import 'gsap/src/uncompressed/plugins/CSSPlugin'
import 'gsap/src/uncompressed/easing/EasePack'
import 'gsap'
import { setTimeout } from 'timers'
import loadResource from 'resl'
import KnockoutText from './lib/KnockoutText'
import work from 'webworkify'
import workerLoadScript from './lib/worker-load'

const load = work( workerLoadScript )
const OrbitControls = createOrbitControls( THREE )
const OBJLoader = createOBJLoader( THREE )

const isLocal = /localhost|10\./.test(window.location.host)

if ( !isLocal ) {
    console.timeEnd = () => 0
    console.warn = () => 0
    console.log = () => 0
}

class App {

    constructor( data ) {

        document.body.classList.add( 'ready' )
        'ontouchmove' in window && document.body.classList.add( 'is-touch' )
        window.historyCoordinates = this.history = []

        this.needsUpdate = false
        this.knockoutText = new KnockoutText()
        this.knockoutText.appendTo( document.body )
        this.mouse = vec2.create()
        this.engine = loop( this.tick.bind( this ) )
        this.winSize = [ window.innerWidth, window.innerHeight ]
        this.useOrtho = false
        this.translations = []
        this.aboutButton = document.getElementById( 'button-about' )
        this.scrollUnit = 0
        this.scrollAmount = 0
        this.scrollMax = 0
        this.loader = new THREE.TextureLoader()
        this.raycaster = new THREE.Raycaster()
        this.navigate = this.navigate.bind( this )

        /**
         * @type {Array<Block>}
         */
        this.blocks = []
        this.setupScene()

        this.resize()
        this.addEventListeners()
    }

    addEventListeners() {
        if ( 'onorientationchange' in window ) {
            window.addEventListener( 'orientationchange', this.resize.bind( this ) )
            this.renderer.domElement.addEventListener( 'touchend', this.onclick.bind( this ) )
            window.addEventListener( 'touchstart', this.onhover.bind( this ) )
            window.addEventListener( 'touchmove', this.onhover.bind( this ) )
        } else {
            window.addEventListener( 'resize', this.resize.bind( this ) )
            this.renderer.domElement.addEventListener( 'click', this.onclick.bind( this ) )
            this.renderer.domElement.addEventListener( 'mousemove', this.onhover.bind( this ) )
            window.addEventListener( 'keyup', this.navigate )
        }
        Hammer(this.renderer.domElement).on("doubletap", () => {
            this.animateTo( this.group )
        })
        this.aboutButton.addEventListener( 'click', this.onAboutClick.bind( this ) )
    }

    navigate( e ) {
        if ( !this.lastMesh ) return
        let nextIndex = -1
        let currentIndex = this.lastMesh.parent.userData.block.position
        if ( e.type == 'keyup' ) {
            if ( keycode(e) == 'left' ) {
                nextIndex = currentIndex - 1
                if ( nextIndex < 0 ) nextIndex = this.blocks.length - 1
            } else if ( keycode( e ) == 'right' ){
                nextIndex = currentIndex + 1
                if ( nextIndex == this.blocks.length ) nextIndex = 0
            }
        } else {
            if ( e.pageX < this.winSize[ 0 ] * 0.5 ) {
                nextIndex = currentIndex - 1
                if ( nextIndex < 0 ) nextIndex = this.blocks.length - 1
            } else {
                nextIndex = currentIndex + 1
                if ( nextIndex == this.blocks.length ) nextIndex = 0
            }
        }

        if ( nextIndex > -1 ) {
            e.preventDefault()
            let mesh = this.group.children.filter( (d ) => d.userData.block.position == nextIndex )
            if ( mesh.length > 0 ) {
                this.zoomToMesh( mesh[ 0 ].getChildByName( 'image-placeholder' ), { key: true })
            }
        }
    }

    onhover( ) {
        clearInterval( this.hideInterval )
        this.aboutButton.classList.add( 'show' )
        this.hideInterval = setTimeout( () => {
            this.aboutButton.classList.remove( 'show' )
        }, 8000 )
    }

    onAboutClick( e ) {
        e.preventDefault()
        this.knockoutText.show()
        this.needsUpdate = false
    }

    changeMaterial( mesh, t ) {
        mesh.material.map = t
        mesh.material.needsUpdate = true
    }

    zoomToMesh( mesh, opt ) {
        if ( !mesh.parent.userData.zoomTexture ) {
            let zoomSrc = mesh.parent.userData.block.zoomSrc
            let src = /\:\/\//.test( zoomSrc ) ? zoomSrc : `${ window.location.origin }/${ zoomSrc }`
            load.onmessage = null
            load.postMessage( [ src ] )
            load.onmessage = ( e ) => {
                this.loader.load( e.data, ( t ) => {
                    mesh.parent.userData.indexTexture = mesh.material.map
                    mesh.parent.userData.zoomTexture = t
                    this.approachCallack = () => {
                        // console.log('change callback')
                        mesh.parent.userData.approachDone = true
                        this.changeMaterial( mesh, t )
                    }
                } )
            }
        } else {
            this.approachCallack = () => {
                // console.log('change callback')
                mesh.parent.userData.approachDone = true
                this.changeMaterial( mesh, mesh.parent.userData.zoomTexture )
            }
        }
        this.animateTo( mesh, null, opt )
        if ( mesh != this.group ) {
            if ( this.lastMesh ) this.lastMesh.parent.userData.approachDone = false
            this.lastMesh = mesh
        }
    }

    onclick( e ) {

        this.updateRaycaster( e.clientX || e.pageX, e.clientY || e.pageY)

        let mesh
        let results = this.raycaster.intersectObjects( this.scene.children, true )

        for ( let i = 0; i < results.length; i++ ) {
            let result = results[ i ]
            if ( /placeholder/.test( result.object.name ) ) { mesh = result.object; break; }
        }
        if ( !mesh ) {
            if ( this.lastMesh ) {
                this.approachCallack = null
                this.lastMesh.parent.userData.approachDone = false
                this.changeMaterial( this.lastMesh, this.lastMesh.parent.userData.indexTexture )
                this.lastMesh = null
                this.animateLoop()  
            }
            return
        }
        if ( mesh != this.lastMesh ) {
            this.zoomToMesh( mesh )
        } else {
            let isTouch = 'ontouchmove' in window
            if ( mesh.parent.userData.approachDone && isTouch ) {
                this.navigate( e )
            }
        }
    }

    updateRaycaster( x, y ) {
        this.mouse[ 0 ] = remap( x, 0, this.winSize[ 0 ], -1,  1 )
        this.mouse[ 1 ] = remap( y, 0, this.winSize[ 1 ],  1, -1 )
        this.raycaster.setFromCamera( { x: this.mouse[ 0 ], y: this.mouse[ 1 ] }, this.camera )
    }

    setupScene() {

        this.scene = new THREE.Scene()
        this.group = new THREE.Object3D()
        this.scene.add( this.group )
        this.renderer = new THREE.WebGLRenderer( { antialias: true } )
        this.renderer.domElement.id = 'main-canvas'
        this.renderer.setPixelRatio( window.devicePixelRatio )
        this.renderer.setSize( this.winSize[ 0 ], this.winSize[ 1 ])
        this.aspect = this.winSize[ 0 ] / this.winSize[ 1 ]
        // this.scene.add( new THREE.AxesHelper( 40 ) )
        let colorValue = 0xd7d7d7
        this.scene.fog = new THREE.FogExp2( colorValue, 0.000005 );
        this.scene.background = new THREE.Color( colorValue );
        this.cameraPositionIntegrator = new Integrator()
        this.cameraTargetIntegrator = new Integrator()
        
        this.objLoader = new OBJLoader()

        let convertToTexture = ( img ) => {
            let tex = new THREE.Texture( img )
            tex.format = /\.jp(e)?g/.test( img.src ) ? THREE.RGBFormat : THREE.RGBAFormat
            tex.needsUpdate = true
            this.renderer.setTexture( tex, 0 )
            return tex
        }

        let base = './assets/images/textures'

        loadResource( {
            manifest: {
                'landscape_background': { type: 'image', src: `${ base }/Landscape-Background.jpg`, parser: convertToTexture },
                'landscape_frame': { type: 'image', src: `${ base }/Landscape-Frame_5_strength_1.5.jpg`, parser: convertToTexture },
                'portrait_background': { type: 'image', src: `${ base }/Portrait-Background.jpg`, parser: convertToTexture },
                'portrait_frame': { type: 'image', src: `${ base }/Portrait-Frame_strength_1.5.jpg`, parser: convertToTexture },
                'frameModel': { type: 'text', src: './assets/models/image-frames.obj', parser: ( data ) => ( new OBJLoader() ).parse( data ) },
                'arena': { type: 'text', src: isLocal ? './assets/data/dummy.json' : 'http://api.are.na/v2/channels/110543', parser: JSON.parse }
              },
              onDone: this.onAssetLoaded.bind( this )
        } )

        if ( this.useOrtho ) {
            let d = window.innerHeight * 0.5
            this.camera = new THREE.OrthographicCamera( - d * this.aspect, d * this.aspect, d, - d, 0.1, 10000000 );
        } else {
            this.camera = new THREE.PerspectiveCamera( 25, this.aspect, 100, 40000 )
            this.camera.position.set(0, 0, 3000)
        }

        this.camera.lookAt( new THREE.Vector3() )

        this.controls = new OrbitControls( this.camera, this.renderer.domElement )
        this.controls.enableDamping = true

        this.camera.position.toArray(this.cameraPositionIntegrator.target)  
        this.controls.target.toArray(this.cameraTargetIntegrator.target)
        this.cameraPositionIntegrator.damping = 0.01
        this.cameraTargetIntegrator.damping = 0.006

        // this.controls.enableKeys = false
        // this.controls.enableZoom = false
        this.controls.enabled = false
        this.knockoutText.on( 'loaded', () => {
            this.needsUpdate = true
            this.resize()
            this.animateLoop()
        } )
        this.knockoutText.on( 'stop', () => {
            this.needsUpdate = true
        })
        this.knockoutText.on( 'resize', () => {
            this.resize()
        })
    }

    onAssetLoaded( assets ) {

        let portraitGroup = new THREE.Object3D()
        let landscapeGroup = new THREE.Object3D()
        this.portraitFrameSize = []
        this.landscapeFrameSize = []

        assets.frameModel.children.forEach( ( m ) => {
            /**
             * @type {THREE.Mesh}
             */
            let name = m.name
            let nameComponents = name.split('-').map( ( d ) => d.toLowerCase().replace( /_.+/g, '' ) )
            let orientation = nameComponents[ 0 ]
            let part = nameComponents[ 1 ]
            let texture = assets[ `${ orientation }_${ part }` ]

            if ( texture ) {
                m.material = new THREE.MeshBasicMaterial( { map: texture } )
            } else {
                m.name = `image-placeholder`
            }

            if ( 'portrait' == orientation ) {
                if ( 'frame' == part ) {
                    let bbox = new THREE.Box3()
                    bbox.setFromObject( m )
                    this.portraitFrameSize[ 0 ] = bbox.max.x - bbox.min.x
                    this.portraitFrameSize[ 1 ] = bbox.max.y - bbox.min.y
                }
                portraitGroup.add( m.clone() )
            } else {
                if ( 'frame' == part ) {
                    let bbox = new THREE.Box3()
                    bbox.setFromObject( m )
                    this.landscapeFrameSize[ 0 ] = bbox.max.x - bbox.min.x
                    this.landscapeFrameSize[ 1 ] = bbox.max.y - bbox.min.y
                }
                landscapeGroup.add( m.clone() )
            }
        })

        isLocal && this.fillDummy( assets )

        this.blocks = assets.arena.contents.map( ( d ) => {
            let block = Block.create( d )
            return block
        } )

        this.loader.crossOrigin = ''

        let translation = [ 0, 0 ]
        let doLayout = true
        let numRows = 4
        let perRow = Math.ceil( this.blocks.length / numRows )
        let spacing = 1600
        let padding = 700
        let numBlocks = this.blocks.length
        this.blocks.forEach( ( block, i, arr ) => {
            i = block.position > -1 ? (block.position - 1) : i
            if ( block.position == -1 ) block.position = i
            let oReq = new XMLHttpRequest();
            oReq.open('GET', block.indexSrc, true)
            oReq.responseType = "blob"
            oReq.onload = ( e ) => {
                let blob = oReq.response
                if ( blob ) {
                    let url = URL.createObjectURL( blob )
                    let img = new Image()
                    img.crossOrigin = "Anonymous"
                    img.onload = () => {
                        let t = new THREE.Texture( img )
                        t.format = /png/.test( block.indexSrc ) ? THREE.RGBAFormat : THREE.RGBFormat
                        t.needsUpdate = true
                        let m = new THREE.MeshBasicMaterial( { side: THREE.DoubleSide, map: t } )
                        this.knockoutText.push( block.indexSrc ) 
                        if ( numBlocks == this.knockoutText.sources.length ) this.knockoutText.onLoaded()
                        let isPortrait = ( t.image.naturalWidth / t.image.naturalHeight ) < 1.0
                        let frameSize = isPortrait ? this.portraitFrameSize : this.landscapeFrameSize
                        let group = ( isPortrait ? portraitGroup : landscapeGroup ).clone()
                        let placeholder = group.getChildByName( 'image-placeholder' )
                        placeholder.material = m
                        placeholder.scale.x *= -1

                        if ( doLayout ) {
                            let x = i % perRow * spacing
                            let y = Math.floor( i / perRow ) * spacing
                            group.position.set( x - spacing * ( perRow - 1 )* 0.5,
                                                y - spacing * (numRows - 1) * 0.5, 0.0)
                        }
                        group.userData.block = block
                        this.renderer.setTexture( t, 0 )
                        this.group.add( group )
                    }
                    img.src = url
                }
            };
            oReq.send()
        } )
    }

    fillDummy( assets ) {
        let files = `
            FUJI_SUPERIA_400_6829_014.jpg
            FUJI_SUPERIA_400_6829_022.jpg
            FUJI_SUPERIA_400_6829_031.jpg
            FUJICOLOR_PRO_400H_0025_016.jpg
            FUJICOLOR_PRO_400H_0026_014.jpg
            FUJICOLOR_PRO_400H_0026_016.jpg
            FUJICOLOR_PRO_400H_6173_008.jpg
            FUJICOLOR_PRO_400H_6173_031.jpg
            FUJICOLOR_PRO_400H_6830_009.jpg
            FUJICOLOR_PRO_400H_6830_036.jpg
            FUJICOLOR_PRO_400H_7241_008.jpg
            FUJICOLOR_PRO_400H_7241_018.jpg
            ILFORD_HP5_PLUS_1522_00035.jpg
            ILFORD_HP5_PLUS_1522_00036.jpg
            ILFORD_HP5_PLUS_1523_00018.jpg
            ILFORD_HP5_PLUS_1523_00032.jpg
            KODAK_400_2TMY_3890_012.jpg
            KODAK_400_2TMY_3890_018.jpg
            KODAK_400_2TMY_201706_00024.jpg
            KODAK_EKTAR_100_5287_00013.jpg
            KODAK_EKTAR_100_5287_00014.jpg
            KODAK_EKTAR_100_5287_00023.jpg
            KODAK_EKTAR_100_5288_00006.jpg
            KODAK_EKTAR_100_5288_00022.jpg
            KODAK_EKTAR_100_5288_00024.jpg
            KODAK_EKTAR_100_5288_00027.jpg
            KODAK_EKTAR_100_5288_00035.jpg
            KODAK_EKTAR_100_5292_00003.jpg
            KODAK_EKTAR_100_5292_00006.jpg
            KODAK_EKTAR_100_5292_00012.jpg
            KODAK_EKTAR_100_5292_00017.jpg
            KODAK_EKTAR_100_5292_00033.jpg
            KODAK_EKTAR_100_5292_00035.jpg`

        files = files.split('\n').filter( ( t ) => t.trim().length > 0 ).map( ( t ) => './1024/' + t.trim() )
        
        assets.arena.contents = files.map( ( d ) => {
            let b = new Block()
            b.src = (/\:\/\//.test( d ) ? '' : './assets/images/') + d
            return b
        })
    }

    animateLoop( target ) {
        if ( !this.lastMesh ) {
            this.animateTo( target, this.animateLoop.bind( this ) )
        }
    }

    animateTo( targetMesh, callback, opt ) {

        opt = opt || {}
        let duration = Math.random() * 5000 + 6000
        let p = this.camera.position.clone().fromArray( this.cameraPositionIntegrator.target ) 
        let t = this.controls.target.clone().fromArray( this.cameraTargetIntegrator.target ) 
        let doFit = Math.random() < 0.2
        // let doOverview = Math.random() < 0.15
        let doOverview = Math.random() < 0.05
        let hasTarget = !!targetMesh
        let randomnessScale = this.winSize[ 0 ] < 500 ? 0.3 : 1.0
        if ( this.lastOverview ) {
            doOverview = false
        }

        targetMesh = targetMesh ? targetMesh : this.group.children[ Math.floor(this.group.children.length * Math.random()) ]
        let positionParams = {  x: targetMesh.position.x + (Math.random() * 10000 - 5000) * randomnessScale,
                                y: targetMesh.position.y + (Math.random() * 3000 - 1500) * randomnessScale,
                                z: targetMesh.position.z + (Math.random() * (Math.random() < 0.4 ? 10000 : 3000 ) + 3000),
                                ease: opt.key ? 'Quint.easeInOut' : 'Expo.easeInOut',
                                onUpdate: () => p.toArray( this.cameraPositionIntegrator.target ),
                                onComplete: () => callback && callback() }
            
        let targetParams = { 
            x: targetMesh.position.x + (doFit ? 0 : (Math.random() * 1000 - 500)) * randomnessScale,
            y: targetMesh.position.y + (doFit ? 0 : (Math.random() * 1000 - 500)) * randomnessScale,
            z: doFit ? 0 : (Math.random() * 2000 - 1000),
            ease: opt.key ? 'Quint.easeInOut' : 'Expo.easeInOut', 
            onUpdate: () => t.toArray( this.cameraTargetIntegrator.target )
        }

        if ( opt.key ) duration *= 0.5

        if ( doFit ) {
            positionParams.x = targetParams.x
            positionParams.y = targetParams.y
            positionParams.z = 3000
        }

        if ( doOverview ) {
            let fitInfo = this.fitCameraToObject( this.group )
            targetParams.x = 0
            targetParams.y = 0
            targetParams.z = 0
            positionParams.x = 0
            positionParams.y = 0
            positionParams.z = fitInfo.position.z
        }

        if ( hasTarget ) {
            this.tl && this.tl.kill()
            // this.cameraPositionIntegrator.damping = 0.01
            // this.cameraTargetIntegrator.damping = 0.01
            let obj = this.fitCameraToObject( targetMesh )
            positionParams.x = obj.position.x
            positionParams.y = obj.position.y
            positionParams.z = obj.position.z
            targetParams.x = obj.target.x
            targetParams.y = obj.target.y
            targetParams.z = obj.target.z
            duration *= 0.5
        }

        if ( (doOverview || doFit || targetMesh == this.group) && positionParams.z > this.camera.far ) {
            positionParams.z = this.camera.far * 0.90
        }
        
        let dist = this.camera.position.distanceTo( targetParams )
        let avgSpeed = dist / duration
        if ( avgSpeed > 1.0 && !this.lastOverview) {
            duration += avgSpeed * 1000
        }
        this.tl = new TimelineLite()
        this.tl.to( p, duration / 1000, positionParams, 0 )
        this.tl.to( t, duration / 1000, targetParams, 0 )
        let damping = hasTarget ? 0.1: 0.01
        this.tl.to( this.cameraTargetIntegrator, duration / (1000 * 2), { damping: damping, ease: 'Expo.easeIn' }, 0.0 )
        this.tl.to( this.cameraPositionIntegrator, duration / (1000 * 2), { damping: damping, ease: 'Expo.easeIn' }, 0.0 )
        this.lastOverview = doOverview || targetMesh == this.group

    }

    appendTo( p ) {
        this.renderer.domElement.style.display = 'block'
        p.appendChild( this.renderer.domElement )
    }

    tick( dt ) {

        this.knockoutText.update()

        if ( this.needsUpdate ) {
            this.controls.update()
            this.renderer.render( this.scene, this.camera )
            this.cameraPositionIntegrator.update( dt )
            this.cameraTargetIntegrator.update( dt )

            this.camera.position.fromArray( this.cameraPositionIntegrator.p )
            this.controls.target.fromArray( this.cameraTargetIntegrator.p )
            // this.history.push(this.camera.position.toArray([]))
            // this.history.push(this.controls.target.toArray([]))

            if ( this.approachCallack && vec3.length( this.cameraPositionIntegrator.velocity ) < 0.0001 ) {
                this.approachCallack()
                this.approachCallack = null
            }
        }

    }

    resize() {
        this.winSize[ 0 ] = window.innerWidth + 3
        this.winSize[ 1 ] = window.innerHeight
        this.aspect = this.winSize[ 0 ] / this.winSize[ 1 ]
        this.knockoutText.winSize = this.winSize
        this.knockoutText.resize()
        if ( this.useOrtho ) {
            let d = this.winSize[ 1 ] * 0.5
            this.camera.left = - d * this.aspect
            this.camera.right = d * this.aspect
            this.camera.top = d
            this.camera.bottom = -d
        } else {
            let fov = this.camera.fov
            let vFOV = fov * ( Math.PI / 180 )
            this.camera.position.z = this.winSize[ 1 ] / (2 * Math.tan(vFOV / 2) )
            this.camera.aspect = this.aspect
        }
        this.renderer.setSize( this.winSize[ 0 ], this.winSize[ 1 ])
        this.renderer.domElement.style.width = this.winSize[ 0 ] + 'px'
        this.renderer.domElement.style.height = this.winSize[ 1 ] + 'px'
        this.camera.updateProjectionMatrix()

        this.lastMesh && this.animateTo( this.lastMesh )
    }
    /**
     * 
     * @param {THREE.Mesh} obj 
     */
    fitCameraToObject( obj, speed ) {
        
        speed = speed || 1.0
        let offset = 1.1
        let shift = 0
        let aspect = this.aspect
        let boundingBox = new THREE.Box3()
        boundingBox.setFromObject( obj )

        let center = boundingBox.getCenter()
        let size = boundingBox.getSize()
        let maxDim = Math.max( size.x, size.y, size.z )
        let targetAspect = size.x / size.y
        let dim = size.y

        if ( aspect > 1.0 && targetAspect > 1.0 ) {
            // console.log( 'window = landscape && target = landscape', aspect, targetAspect )
            if ( aspect < targetAspect ) {
                let currentW = targetAspect * this.winSize[ 1 ]
                let scale = this.winSize[ 0 ] / currentW
                dim /= scale
            }
        } else if ( aspect < 1.0 && targetAspect > 1.0 ) {
            // console.log( 'window = portrait && target = landscape', aspect, targetAspect )
            if ( aspect < targetAspect ) {
                // console.log('good')
                let currentW = targetAspect * this.winSize[ 1 ]
                let scale = this.winSize[ 0 ] / currentW
                dim /= scale
            }
        } else if ( aspect < 1.0 && targetAspect < 1.0 ) {
            // console.log( 'window = portrait && target = portrait', aspect, targetAspect )
            if ( aspect < targetAspect ) {
                // console.log('good')
                let currentW = targetAspect * this.winSize[ 1 ]
                let scale = this.winSize[ 0 ] / currentW
                dim /= scale
            }
        } else if ( aspect > 1.0 && targetAspect < 1.0 ) {
            // console.log( 'window = landscape && target = portrait', aspect, targetAspect )
        }
        let cameraZ = dim / 2 / Math.tan(Math.PI * this.camera.fov / 360);
        cameraZ *= offset
        return { position: {x: center.x, y: center.y, z: cameraZ}, target: center }
    }
}


class Block {
    constructor() {
        this.id = -1
        this.position = -1
        this.src = null
    }

    get indexSrc() { return this.src.replace( '1024', window.screen.width < 512 ? 512 : 1024 ) }
    get zoomSrc() { return this.src.replace( '1024', window.screen.width < 512 ? 1024 : 2560 ) }

    static create( json ) {
        let block = new Block()
        for ( let k in block ) {
            block[ k ] = json[ k ]
        }
        if ( json.source && json.source.url ) {
            block.src = json.source.url.replace(/\?.+/, '')
        }
        return block
    }
}

export default App