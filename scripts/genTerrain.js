import { config } from "../server.js"
import { makeNoise2D } from 'open-simplex-noise'

const noise2D = makeNoise2D(Math.random())

export function genTerrain() {
    const w = config.terrain.gridSize, scale = config.terrain.noiseScale, maxHeight = config.terrain.maxHeight

    const matrix = []
    for (let x = 0; x < w; x++) {
        matrix[x] = []
        for(let y = 0; y < w; y++) {
            const val = noise2D(x * scale, y * scale)
            matrix[x][y] = (val + 1) / 2 * maxHeight
        }
    }

    return {matrix, size: config.terrain.size}
}