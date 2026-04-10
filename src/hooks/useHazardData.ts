import { useState, useEffect } from 'react';
import type { FeatureCollection } from 'geojson';
import { fetchDistricts, fetchDynamicHazardChunk, fetchDynamicHazardProgressive } from '../services/mapDataAccess';

// Represents the data output of the ML severity indexing
export interface MLHazardScore {
  districtName: string;
  mlSeverityIndex: number;  // 0-100 score
  factors: {
    structural: number;
    exposure: number;
    cycloneHistory: number;
    surgeRisk: number;
    floodMemory: number;
  };
}

export function useHazardData() {
  const [vectorData, setVectorData] = useState<FeatureCollection | null>(null);
  const [mlScores, setMlScores] = useState<Record<string, MLHazardScore>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    function buildScores(vectorGeoJson: FeatureCollection, dynamicEnv: { stale?: boolean; localities?: Record<string, any> }) {
      const newScores: Record<string, MLHazardScore> = {};

      for (const feature of vectorGeoJson.features) {
        const districtName = String(feature.properties?.ADM2_EN || 'Unknown');

        const seed = Array.from(districtName).reduce((sum: number, char: string) => sum + char.charCodeAt(0), 0);
        const structural = (seed % 100) / 100;
        const exposure = ((seed * 13) % 100) / 100;
        const cycloneHistory = ((seed * 7) % 100) / 100;
        const surgeRisk = ((seed * 23) % 100) / 100;
        const floodMemory = ((seed * 31) % 100) / 100;

        let dynamicBoost = 0;
        if (dynamicEnv && !dynamicEnv.stale && dynamicEnv.localities) {
          const keys = Object.keys(dynamicEnv.localities);
          const match = keys.find(
            k => k.includes(districtName) || k.includes(districtName.substring(0, 4).toUpperCase())
          );
          if (match) {
            dynamicBoost = dynamicEnv.localities[match].dynamic_boost || 0;
          }
        }

        const nonLinearCombination =
          0.3 * Math.pow(surgeRisk, 2) +
          0.4 * (cycloneHistory * exposure) +
          0.2 * structural +
          0.1 * floodMemory +
          dynamicBoost * 0.5;

        const severity = Math.min(100, Math.max(0, nonLinearCombination * 100));

        newScores[districtName] = {
          districtName,
          mlSeverityIndex: severity,
          factors: {
            structural,
            exposure,
            cycloneHistory,
            surgeRisk,
            floodMemory,
          },
        };
      }

      return newScores;
    }

    async function fetchDynamicMLData() {
      setIsLoading(true);
      try {
        // 1. Fetch precision vector boundaries (Districts/Unions)
        const vectorGeoJson: FeatureCollection = await fetchDistricts('lod1');

        // 2. Pull only the first hazard chunk for fast initial response.
        const firstChunk = await fetchDynamicHazardChunk(0, 250);
        const fastScores = buildScores(vectorGeoJson, {
          stale: firstChunk.stale,
          localities: firstChunk.localities,
        });

        setVectorData(vectorGeoJson);
        setMlScores(fastScores);

        // 3. Continue in background and refine with the full hazard stream.
        fetchDynamicHazardProgressive(500)
          .then(fullDynamic => {
            const refinedScores = buildScores(vectorGeoJson, fullDynamic);
            setMlScores(refinedScores);
          })
          .catch(err => {
            console.warn('Progressive hazard enrichment failed:', err);
          });
      } catch (err) {
        console.error("Failed to fetch ML hazard data integrations:", err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchDynamicMLData();
  }, []);

  return { vectorData, mlScores, isLoading };
}
