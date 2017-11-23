import { EventEmitter } from "events";

class KnockoutText extends EventEmitter {
    constructor() {
        super()
        this.container = document.createElement( 'div' )
        this.container.classList.add( 'knockout-container' )
        this.el = document.createElement( 'h1' )
        this.el.classList.add( 'knockout' )
        this.el.innerHTML = 'Loading shots from Contax T3.'
        this.info = document.querySelector('.info')
        this.info.classList.add( 'info' )
        this.container.appendChild( this.el )
        this.container.appendChild( this.info )
        this.winSize = [window.innerWidth, window.innerHeight]
        this.index = -1
        this.sources = []
        this.rate = 2
        this.initialRate = this.rate
        this.frame = 0
        this.needsUpdate = true
        this.minimumPlayDuration = 5000
        this.startTime = 0
    }


    push( src ) {
        this.sources.push( src )
        this.el.style.backgroundImage = `url( ${ src } )`
        if ( this.sources.length == 0 ) {
            this.startTime = Date.now()
        }
    }

    update() {
        if ( !this.needsUpdate ) return
        this.frame++
        if ( this.frame % this.rate > 0 ) return
        if( this.sources.length > 0 ) {
            if ( this.index == -1 ) {
                this.index = 0
            } else {
                this.index++
                if ( this.index == this.sources.length ) {
                    this.index = 0
                }
            }
            this.el.style.backgroundImage = `url( ${ this.sources[ this.index ] } )`
        }
    }

    appendTo( p ) {
        p.appendChild( this.container )
        this.resize()
    }

    onLoaded() {
        setTimeout( () => {
            this.rate = 1000
            this.el.innerHTML = 'Loaded.'
        }, this.minimumPlayDuration * 0.75)
        setTimeout( () => {
            this.stop()
            this.emit( 'loaded' )
            this.container.addEventListener( 'click', this.onclick.bind( this ) )
        }, this.minimumPlayDuration )
    }

    onclick( e ) {
        e.preventDefault()
        this.stop()
        this.emit( 'stop' )
    }

    stop() {
        this.needsUpdate = false
        this.frame = 0
        this.container.style.display = 'none'
    }

    show() {
        this.needsUpdate = true
        this.el.innerHTML = 'Shot on Contax T3.'
        this.container.classList.add( 'about-pane' )
        this.container.style.display = ''
        this.rate = this.initialRate
        this.resize()
    }

    resize() {
        if ( !this.needsUpdate ) return
        let startFontSize = this.winSize[ 0 ] / 3
        let fontSize = startFontSize
        let count = 0
        this.el.style.fontSize = ''
        let watch = () => {
            count++
            let bbox = this.el.getBoundingClientRect()
            let wRatio = bbox.width / this.winSize[ 0 ]
            let hRatio = bbox.height / this.winSize[ 1 ]
            if ( wRatio > 1.0 || hRatio > 0.8 ) {
                // if ( wRatio > 1.0) {
                    fontSize -= (wRatio) * 50
                // } else {
                //     fontSize += 2
                // }
                fontSize = Math.max(Math.floor( fontSize ), 70)
                this.el.style.fontSize = fontSize + 'px'
                // console.log('still', fontSize, wRatio)
                requestAnimationFrame( watch.bind( this ) )
            } else{
                // console.log('done', count)
            }
        }
        requestAnimationFrame(watch.bind(this))
    }
}


export default KnockoutText