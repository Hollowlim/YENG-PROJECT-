# React Bits ReflectiveCard (JS-CSS)

The JSX and CSS are verbatim from the official registry JSON at:
https://raw.githubusercontent.com/DavidHDev/react-bits/main/public/r/ReflectiveCard-JS-CSS.json

Requested public endpoint: https://reactbits.dev/r/ReflectiveCard-JS-CSS.json (403 from this environment). Extracted files directly rather than running the shadcn installer against a blocked endpoint. Registry dependencies `@hugeicons/react@^1.1.10` and `@hugeicons/core-free-icons@^4.3.3`, plus React and React DOM, are installed through npm.

Homepage integration lives in `../home-product-effects.js` and `.css`. Product content is passed through the supported `children` prop instead of showing the example personal ID. White tint, metalness 1, roughness .3, blur 6, shine 1, glare .5, webcam false. A bundled generated four-second abstract light sweep supplies the video reflection; no camera access. Light theme and square corners match the store. Intro is disabled to avoid hiding product photos while initializing. Upstream supports reduced motion and offscreen cleanup; React roots are unmounted before navigation.
