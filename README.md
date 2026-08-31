# 1975 Porsche 911 Turbo

Hey, this is my small pet project. I was just interested in playing with 3D models a bit,
so I built a page around a 930 and let the scrolling drive the camera.

## What it does

Four shots, one per screen of scrolling:

1. Straight down on the car with the description next to it
2. In close on the bonnet, with the engine details
3. Side on, rolled so the car stands upright, tight on a rear wheel
4. The whole car from a distance, turning slowly. Drag it with the mouse to turn it yourself

The camera is a pure function of scroll position, so scrolling back always lands on the
exact same framing you saw on the way down.

## Running it

Needs a local server. The page loads ES modules and the glTF over fetch, and browsers block
both on `file://`, so it has to be served over http.

```bash
python -m http.server 8080
```

Then open http://localhost:8080.

Built with three.js pulled from a CDN. No build step, nothing to install.

Add `#tune` to the URL to take over the camera and orbit freely. The readout in the corner
prints the numbers for whatever view you land on, ready to paste into the shot list in
`main.js`.

## Credit

This work is based on ["FREE 1975 Porsche 911 (930) Turbo"](https://sketchfab.com/3d-models/free-1975-porsche-911-930-turbo-8568d9d14a994b9cae59499f0dbed21e)
by [Lionsharp Studios](https://sketchfab.com/lionsharp) licensed under
[CC-BY-4.0](http://creativecommons.org/licenses/by/4.0/).
