import App from './index'
import isInApp from './lib/DetectInApp'

let app = new App()
app.appendTo( document.body )
app.engine.start()

if ( isInApp ) {
    setTimeout( () => {
        app.resize()
    }, 1000.0 )
}