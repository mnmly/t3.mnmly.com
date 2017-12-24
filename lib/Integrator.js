import vec3 from 'gl-vec3'
import vec4 from 'gl-vec4'

class Integrator {
    constructor( numComponent ) {
        this.numComponent = numComponent || 3
        this.vec = this.numComponent == 4 ? vec4 : vec3
        this.p = this.vec.create()
        this.target = this.vec.create()
        this.velocity = this.vec.create()
        this.damping = 0.01
    }

    update( dt ) {
        let temp = this.vec.clone( this.p )
        for ( let i = 0; i < this.numComponent; i++ ) {
            this.p[ i ] = this.p[ i ] * ( 1 - this.damping ) + this.target[ i ] * this.damping
        }
        this.vec.subtract( this.velocity, temp, this.p )
        this.vec.scale( this.velocity, this.velocity, 1 / dt )
        return this.p
    }
}

export default Integrator