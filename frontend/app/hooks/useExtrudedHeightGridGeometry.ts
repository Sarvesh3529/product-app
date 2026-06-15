import { useMemo } from 'react';
import * as THREE from 'three';

/**
 * Generates a closed, water-tight BufferGeometry from a 2D height grid.
 */
export function useExtrudedHeightGridGeometry(heightGrid: number[][] | null, size: number, extrusionScale: number): THREE.BufferGeometry | null {
    return useMemo(() => {
        if (!heightGrid || heightGrid.length === 0) return null;

        const geometry = new THREE.BufferGeometry();
        const vertices: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];

        const numVerticesPerSide = size;
        const numCellsPerSide = size - 1;

        // 1. Generate Vertices and UVs (Front and Back)
        for (let y = 0; y < numVerticesPerSide; y++) {
            for (let x = 0; x < numVerticesPerSide; x++) {
                const h = heightGrid[y][x] || 0;
                const zFront = h * extrusionScale;
                const zBack = -h * extrusionScale;

                const u = x / (numVerticesPerSide - 1);
                const v = y / (numVerticesPerSide - 1);

                // Front vertex (Even index)
                vertices.push(x, y, zFront);
                uvs.push(u, v);

                // Back vertex (Odd index)
                vertices.push(x, y, zBack);
                uvs.push(1 - u, v); // Mirrored horizontally
            }
        }

        // 2. Main Surface Indices (Top & Bottom Planes)
        for (let y = 0; y < numCellsPerSide; y++) {
            for (let x = 0; x < numCellsPerSide; x++) {
                const i0 = 2 * (y * numVerticesPerSide + x);
                const i1 = 2 * (y * numVerticesPerSide + (x + 1));
                const i2 = 2 * ((y + 1) * numVerticesPerSide + x);
                const i3 = 2 * ((y + 1) * numVerticesPerSide + (x + 1));

                // Front faces (CCW)
                indices.push(i0, i1, i2);
                indices.push(i1, i3, i2);

                // Back faces (CW from front, CCW from behind)
                indices.push(i0 + 1, i2 + 1, i1 + 1);
                indices.push(i1 + 1, i2 + 1, i3 + 1);
            }
        }

        // 3. Side Walls (Mesh Skirt)
        // Top edge (y = 0)
        for (let x = 0; x < numCellsPerSide; x++) {
            const f1 = 2 * (0 * numVerticesPerSide + x);
            const b1 = f1 + 1;
            const f2 = 2 * (0 * numVerticesPerSide + (x + 1));
            const b2 = f2 + 1;
            indices.push(f1, b1, f2);
            indices.push(b1, b2, f2);
        }

        // Bottom edge (y = size - 1)
        for (let x = 0; x < numCellsPerSide; x++) {
            const f1 = 2 * ((numVerticesPerSide - 1) * numVerticesPerSide + x);
            const b1 = f1 + 1;
            const f2 = 2 * ((numVerticesPerSide - 1) * numVerticesPerSide + (x + 1));
            const b2 = f2 + 1;
            indices.push(f1, f2, b1);
            indices.push(f2, b2, b1);
        }

        // Left edge (x = 0)
        for (let y = 0; y < numCellsPerSide; y++) {
            const f1 = 2 * (y * numVerticesPerSide + 0);
            const b1 = f1 + 1;
            const f2 = 2 * ((y + 1) * numVerticesPerSide + 0);
            const b2 = f2 + 1;
            indices.push(f1, f2, b1);
            indices.push(f2, b2, b1);
        }

        // Right edge (x = size - 1)
        for (let y = 0; y < numCellsPerSide; y++) {
            const f1 = 2 * (y * numVerticesPerSide + (numVerticesPerSide - 1));
            const b1 = f1 + 1;
            const f2 = 2 * ((y + 1) * numVerticesPerSide + (numVerticesPerSide - 1));
            const b2 = f2 + 1;
            indices.push(f1, b1, f2);
            indices.push(b1, b2, f2);
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        return geometry;
    }, [heightGrid, size, extrusionScale]);
}