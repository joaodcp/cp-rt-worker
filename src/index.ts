import { CPTrain, StaticTrain, Station } from './cp.types';

async function getAllTrainsStaticInfo(): Promise<StaticTrain[]> {
	const trainsRes = await fetch('https://api-gateway.cp.pt/cp/services/travel-api/trains', {
		headers: {
			'x-api-key': process.env.TRAVEL_API_KEY!,
			'x-cp-connect-id': process.env.TRAVEL_CONNECT_ID!,
			'x-cp-connect-secret': process.env.TRAVEL_CONNECT_SECRET!,
			'User-Agent': process.env.USER_AGENT!,
		},
		cf: {
			cacheEverything: true,
			cacheTtl: 1800,
		},
	});
	const trains = (await trainsRes.json()) as StaticTrain[];

	return trains;
}

async function getTrainDataDetailed(trainNumbers: number[]): Promise<Record<string, CPTrain>> {
	const realtimeTrainsRes = await fetch('https://api-gateway.cp.pt/cp/services/realtime-api/trains/details', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': process.env.REALTIME_API_KEY!,
			'x-cp-connect-id': process.env.REALTIME_CONNECT_ID!,
			'x-cp-connect-secret': process.env.REALTIME_CONNECT_SECRET!,
			'User-Agent': process.env.USER_AGENT!,
		},
		body: JSON.stringify(trainNumbers),
	});

	if (!realtimeTrainsRes.ok) {
		throw new Error('Got NOK response from CP-RT on /trains/details: ' + (await realtimeTrainsRes.text()));
	}

	return realtimeTrainsRes.json();
}

async function getAllStations(): Promise<Station[]> {
	const stationsRes = await fetch('https://api-gateway.cp.pt/cp/services/travel-api/stations', {
		headers: {
			'x-api-key': process.env.TRAVEL_API_KEY!,
			'x-cp-connect-id': process.env.TRAVEL_CONNECT_ID!,
			'x-cp-connect-secret': process.env.TRAVEL_CONNECT_SECRET!,
			'User-Agent': process.env.USER_AGENT!,
		},
		cf: {
			cacheEverything: true,
			cacheTtl: 1800,
		},
	});

	return stationsRes.json();
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		if (request.headers.get('Authorization') !== `Bearer ${process.env.WORKER_KEY!}`) {
			return new Response('Unauthorized', { status: 401 });
		}

		const { pathname, searchParams } = new URL(request.url);
		const pathnameParts = pathname.split('/').filter(Boolean);

		if (pathnameParts.length == 1 && pathnameParts[0] === 'stations') return Response.json({ stations: await getAllStations() });

		const excludes = searchParams.get('excludes')?.split(',') || [];
		const excludeCompletedTrains = excludes.includes('completed');

		const staticTrains = await getAllTrainsStaticInfo();
		const staticIndex = new Map(staticTrains.map((t) => [t.trainNumber, t]));

		const trainNumbers = [...new Set(staticTrains.map((t) => t.trainNumber))];

		const detailedRealtimeTrains = await getTrainDataDetailed(trainNumbers);

		const allTrains = [];
		for (const key in detailedRealtimeTrains) {
			const t = detailedRealtimeTrains[key];
			if (t.status) allTrains.push(t.status);
		}

		// single pass aggregation
		let cancelled = 0,
			running = 0,
			sumSpeed = 0,
			sumDelay = 0;
		let maxDelay = -Infinity,
			minDelay = Infinity;
		let maxOcc = -Infinity,
			minOcc = Infinity,
			occCount = 0;
		let maxRunningDelay = -Infinity,
			minRunningDelay = Infinity;

		const runningTrains = [];

		for (const t of allTrains) {
			const d = t.delay ?? 0;
			const occ = t.occupancy;

			sumDelay += d;
			if (t.status === 'CANCELLED') {
				cancelled++;
			} else if (t.status !== 'COMPLETED') {
				running++;
				sumSpeed += t.speed ?? 0;
				runningTrains.push(t);
				if (d > maxRunningDelay) maxRunningDelay = d;
				if (d < minRunningDelay) minRunningDelay = d;
			}

			if (d > maxDelay) maxDelay = d;
			if (d < minDelay) minDelay = d;

			if (occ != null) {
				if (occ > maxOcc) maxOcc = occ;
				if (occ < minOcc) minOcc = occ;
				occCount++;
			}
		}

		if (pathnameParts.length === 1 && pathnameParts[0] === 'stats') {
			return Response.json({
				stats: {
					cancelled,
					running,
					avgSpeed: running ? sumSpeed / running : 0,
					avgDelay: allTrains.length ? sumDelay / allTrains.length : 0,
					maxDelay,
					maxRunningDelay,
					maxAheadness: minDelay,
					maxRunningAheadness: minRunningDelay,
					maxOccupancy: maxOcc,
					minOccupancy: minOcc,
					trainsSupportingOccupancyData: occCount,
				},
			});
		}

		const filteredTrains = excludeCompletedTrains ? allTrains.filter((t) => t.status !== 'COMPLETED') : allTrains;

		const enrichedTrains = filteredTrains.map((ft) => {
			const match = staticIndex.get(ft.trainNumber);
			if (!match) return ft;
			return { ...ft, service: match.trainService, origin: match.trainOrigin, destination: match.trainDestination };
		});

		return Response.json({ vehicles: enrichedTrains });
	},
};
