/* Scramble Text */
document.addEventListener('DOMContentLoaded', (e) => {
    gsap.registerPlugin(ScrambleTextPlugin)
    gsap.registerPlugin(ScrollTrigger)

    let bannerText = document.querySelector('#main_text')
    gsap.to(bannerText, {
        duration: 1,
        scrambleText: {
            text: 'Otimize suas pesquisas com o Tag',
            revealDelay: 0.2,
            speed: 0.3,
            chars: 'UFTM'
        }
    });


    /* Scroll FX */
    let tl = gsap.timeline({
        ScrollTrigger: {
            trigger: '#main--container',
            scrub: true,
            pin: true,
            markers: true,
            start: 'top top',
            end: '+=500'
        }
    });

    tl.from('.intro--banner', {opacity:0,x:-1000})
    .to('.presentation--buttons', {scale:1.1})
})

/* TryWeb Location */
document.getElementById('tryWebBtn').addEventListener('click', (e) => {
    window.location = "converter.html"
})


