function detect() {
    let userAgent = window.navigator.userAgent.toLowerCase()
    return /iphone|ipod|ipad/.test( userAgent ) && !/safari/.test( userAgent )
}
export default detect()