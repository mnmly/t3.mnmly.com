import vec3 from 'gl-vec3'

class Integrator {
    constructor() {
        this.p = vec3.create()
        this.target = vec3.create()
        this.velocity = vec3.create()
        this.damping = 0.01
    }

    update( dt ) {
        let temp = vec3.clone( this.p )
        vec3.set( this.p,
            this.p[ 0 ] * ( 1 - this.damping ) + this.target[ 0 ] * this.damping,
            this.p[ 1 ] * ( 1 - this.damping ) + this.target[ 1 ] * this.damping,
            this.p[ 2 ] * ( 1 - this.damping ) + this.target[ 2 ] * this.damping
        )
        vec3.subtract( this.velocity, temp, this.p )
        vec3.scale( this.velocity, this.velocity, 1 / dt )
        return this.p
    }
}

export default Integrator