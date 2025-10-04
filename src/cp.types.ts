interface GenericEntity {
	code: string;
	designation: string;
}

export interface StaticTrain {
	trainNumber: number;
	trainService: GenericEntity;
	trainOrigin: GenericEntity;
	trainDestination: GenericEntity;
}

export interface CPTrain {
	status: TrainStatus;
	stops: Record<string, StopInfo>;
	platforms: Record<string, string>;
}

export interface Station extends GenericEntity {
	latitude: string;
	longitude: string;
	region: string | null;
	railways: string[];
}

interface TrainStatus {
	trainNumber: number;
	runDate: string; // YYYY-MM-DD
	delay: number | null;
	speed: number | null;
	occupancy: number | null;
	lastStation: string | null;
	lastDependency: string | null;
	latitude: string | null;
	longitude: string | null;
	source: string;
	status: string;
	hasDisruptions: boolean | null;
	units: string[];
}
interface StopInfo {
	arrival?: string;
	departure?: string;
	arrDelay?: number;
	depDelay?: number;
}
