/**
 * @author richt / http://richt.me
 * @author WestLangley / http://github.com/WestLangley
 *
 * W3C Device Orientation control (http://w3c.github.io/deviceorientation/spec-source-orientation.html)
 */

import Integrator from './Integrator'
import remap from 'remap'

export default ( THREE ) => {

    return function( object ) {
        
            var scope = this;
        
            this.object = object;
            this.object.rotation.reorder( "YXZ" );
        
            this.enabled = true;
        
            this.deviceOrientation = {};
            this.screenOrientation = 0;
            this.integrator = new Integrator(4)
            this.integrator.damping = 0.2

            this.canvas = document.createElement( 'canvas' )
            this.canvas.width = window.innerWidth
            this.canvas.height = window.innerHeight
            this.canvasPrev = document.createElement( 'canvas' )
            this.canvasPrev.width = window.innerWidth
            this.canvasPrev.height = window.innerHeight

            this.log = document.createElement( 'div' )
            document.body.appendChild( this.log )
            this.log.style.position = 'fixed'
            this.log.style.zIndex = 101
            this.log.style.top = 0

            document.body.appendChild( this.canvas )
            this.canvas.style.position = 'fixed'
            this.canvas.style.top = 0
            this.canvas.style.left = 0
            this.canvas.style.zIndex = 100
        
            this.alphaOffset = 0; // radians
        
            var onDeviceOrientationChangeEvent = function( event ) {
        
                scope.deviceOrientation = event;
        
        
            };
        
            var onScreenOrientationChangeEvent = function() {
        
                scope.screenOrientation = window.orientation || 0;
        
            };
        
            // The angles alpha, beta and gamma form a set of intrinsic Tait-Bryan angles of type Z-X'-Y''
        
            var setObjectQuaternion = function() {
        
                var zee = new THREE.Vector3( 0, 0, 1 );
        
                var euler = new THREE.Euler();
        
                var q0 = new THREE.Quaternion();
        
                var q1 = new THREE.Quaternion( - Math.sqrt( 0.5 ), 0, 0, Math.sqrt( 0.5 ) ); // - PI/2 around the x-axis
        
                return function( quaternion, alpha, beta, gamma, orient ) {
        
                    euler.set( beta, alpha, - gamma, 'YXZ' ); // 'ZXY' for the device, but 'YXZ' for us
        
                    quaternion.setFromEuler( euler ); // orient the device
        
                    quaternion.multiply( q1 ); // camera looks out the back of the device, not the top
        
                    quaternion.multiply( q0.setFromAxisAngle( zee, - orient ) ); // adjust for screen orientation
        
                }
        
            }();
        
            this.connect = function() {
        
                onScreenOrientationChangeEvent(); // run once on load
        
                window.addEventListener( 'orientationchange', onScreenOrientationChangeEvent, false );
                window.addEventListener( 'deviceorientation', onDeviceOrientationChangeEvent, false );
        
                scope.enabled = true;
        
            };
        
            this.disconnect = function() {
        
                window.removeEventListener( 'orientationchange', onScreenOrientationChangeEvent, false );
                window.removeEventListener( 'deviceorientation', onDeviceOrientationChangeEvent, false );
        
                scope.enabled = false;
        
            };
        
            this.update = function() {
        
                if ( scope.enabled === false ) return;

                var alpha = scope.deviceOrientation.alpha ? THREE.Math.degToRad( scope.deviceOrientation.alpha ) + scope.alphaOffset : 0; // Z
                var beta = scope.deviceOrientation.beta ? THREE.Math.degToRad( scope.deviceOrientation.beta ) : 0; // X'
                var gamma = scope.deviceOrientation.gamma ? THREE.Math.degToRad( scope.deviceOrientation.gamma ) : 0; // Y''
                var orient = scope.screenOrientation ? THREE.Math.degToRad( scope.screenOrientation ) : 0; // O

                let context = this.canvas.getContext( '2d' )
                // debugger
                context.clearRect(0, 0, this.canvas.width, this.canvas.height)
                context.drawImage( this.canvasPrev, -3, 0 )

                let wrapped = false
                if ( Math.abs(scope.integrator.target[ 0 ] - alpha) > Math.PI ) {
                    scope.integrator.target[ 0 ] = Math.PI * 2 + alpha
                } else {
                    scope.integrator.target[ 0 ] = alpha
                }
                scope.integrator.target[ 1 ] = beta
                scope.integrator.target[ 2 ] = gamma
                scope.integrator.target[ 3 ] = orient

                context.save()
                context.fillStyle = 'blue'
                context.beginPath()
                context.arc( this.canvas.width - 3, remap( gamma, -Math.PI, Math.PI, -this.canvas.height * 0.5, this.canvas.height * 0.5 ), 1, 0, Math.PI * 2 )
                context.fill()
                context.restore()
                
                this.log.innerHTML = Math.round(beta / Math.PI * 180 * 100) / 100 + ' ' + wrapped
                // context.fillText( alpha, 10, 10 )

                console.log( `${alpha}\t${beta}\t${gamma}\t${orient}` )

                this.integrator.update()

                alpha = this.integrator.p[ 0 ]
                beta = this.integrator.p[ 1 ]
                gamma = this.integrator.p[ 2 ]
                orient = this.integrator.p[ 3 ]

                context.save()
                context.fillStyle = 'red'
                context.beginPath()
                context.arc( this.canvas.width - 3, remap( gamma, -Math.PI, Math.PI, -this.canvas.height * 0.5, this.canvas.height * 0.5 ), 1, 0, Math.PI * 2 )
                context.fill()
                context.restore()

                // console.log( `${alpha}\t${beta}\t${gamma}\t${orient}` )
                console.log('--------------')
        
                setObjectQuaternion( scope.object.quaternion, alpha, beta, gamma, orient );
                this.canvasPrev.getContext('2d').clearRect(0, 0, this.canvas.width, this.canvas.height)
                this.canvasPrev.getContext('2d').drawImage( this.canvas, 0, 0 )
        
            };
        
            this.dispose = function() {
        
                this.disconnect();
        
            };
        
            this.connect();
        
        };
}
    
    