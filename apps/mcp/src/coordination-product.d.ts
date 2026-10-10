import { WorkMeshClient } from '@workmesh/agent-sdk';
import { z } from 'zod';
import type { PreparedDiscovery } from './discovery.js';
type ProjectRow = {
    id: string;
    team_id: string;
    name: string;
    revision: number;
};
type WorkItemRow = {
    id: string;
    team_id: string;
    team_key: string;
    number: number;
    title: string;
    revision: number;
};
export type IdentifierKind = 'team' | 'workflow_state' | 'project' | 'work_item' | 'milestone';
export type IdentifierInput = {
    kind: IdentifierKind;
    ref: string;
    teamRef?: string;
    projectRef?: string;
};
export declare const projectImportSchema: z.ZodObject<{
    teamRef: z.ZodString;
    defaultStatus: z.ZodString;
    project: z.ZodObject<{
        sourceId: z.ZodString;
        name: z.ZodString;
        summary: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        status: z.ZodOptional<z.ZodString>;
        provenance: z.ZodOptional<z.ZodObject<{
            provider: z.ZodString;
            sourceUrl: z.ZodString;
            sourceIdentifier: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            provider: string;
            sourceUrl: string;
            sourceIdentifier: string;
        }, {
            provider: string;
            sourceUrl: string;
            sourceIdentifier: string;
        }>>;
    }, "strict", z.ZodTypeAny, {
        name: string;
        sourceId: string;
        status?: string | undefined;
        description?: string | undefined;
        summary?: string | undefined;
        provenance?: {
            provider: string;
            sourceUrl: string;
            sourceIdentifier: string;
        } | undefined;
    }, {
        name: string;
        sourceId: string;
        status?: string | undefined;
        description?: string | undefined;
        summary?: string | undefined;
        provenance?: {
            provider: string;
            sourceUrl: string;
            sourceIdentifier: string;
        } | undefined;
    }>;
    milestones: z.ZodDefault<z.ZodArray<z.ZodObject<{
        sourceId: z.ZodString;
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        targetDate: z.ZodOptional<z.ZodString>;
        provenance: z.ZodOptional<z.ZodObject<{
            provider: z.ZodString;
            sourceUrl: z.ZodString;
            sourceIdentifier: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            provider: string;
            sourceUrl: string;
            sourceIdentifier: string;
        }, {
            provider: string;
            sourceUrl: string;
            sourceIdentifier: string;
        }>>;
    }, "strict", z.ZodTypeAny, {
        name: string;
        sourceId: string;
        description?: string | undefined;
        targetDate?: string | undefined;
        provenance?: {
            provider: string;
            sourceUrl: string;
            sourceIdentifier: string;
        } | undefined;
    }, {
        name: string;
        sourceId: string;
        description?: string | undefined;
        targetDate?: string | undefined;
        provenance?: {
            provider: string;
            sourceUrl: string;
            sourceIdentifier: string;
        } | undefined;
    }>, "many">>;
    workItems: z.ZodDefault<z.ZodArray<z.ZodObject<{
        sourceId: z.ZodString;
        title: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        status: z.ZodOptional<z.ZodString>;
        priority: z.ZodOptional<z.ZodEnum<["none", "low", "medium", "high", "urgent"]>>;
        labels: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        dueDate: z.ZodOptional<z.ZodString>;
        milestoneSourceId: z.ZodOptional<z.ZodString>;
        parentSourceId: z.ZodOptional<z.ZodString>;
        provenance: z.ZodOptional<z.ZodObject<{
            provider: z.ZodString;
            sourceUrl: z.ZodString;
            sourceIdentifier: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            provider: string;
            sourceUrl: string;
            sourceIdentifier: string;
        }, {
            provider: string;
            sourceUrl: string;
            sourceIdentifier: string;
        }>>;
    }, "strict", z.ZodTypeAny, {
        title: string;
        sourceId: string;
        status?: string | undefined;
        description?: string | undefined;
        priority?: "none" | "urgent" | "high" | "medium" | "low" | undefined;
        dueDate?: string | undefined;
        labels?: string[] | undefined;
        provenance?: {
            provider: string;
            sourceUrl: string;
            sourceIdentifier: string;
        } | undefined;
        milestoneSourceId?: string | undefined;
        parentSourceId?: string | undefined;
    }, {
        title: string;
        sourceId: string;
        status?: string | undefined;
        description?: string | undefined;
        priority?: "none" | "urgent" | "high" | "medium" | "low" | undefined;
        dueDate?: string | undefined;
        labels?: string[] | undefined;
        provenance?: {
            provider: string;
            sourceUrl: string;
            sourceIdentifier: string;
        } | undefined;
        milestoneSourceId?: string | undefined;
        parentSourceId?: string | undefined;
    }>, "many">>;
    relations: z.ZodDefault<z.ZodArray<z.ZodObject<{
        sourceId: z.ZodOptional<z.ZodString>;
        sourceWorkItemId: z.ZodString;
        targetWorkItemId: z.ZodString;
        kind: z.ZodEnum<["blocks", "related"]>;
    }, "strict", z.ZodTypeAny, {
        kind: "blocks" | "related";
        targetWorkItemId: string;
        sourceWorkItemId: string;
        sourceId?: string | undefined;
    }, {
        kind: "blocks" | "related";
        targetWorkItemId: string;
        sourceWorkItemId: string;
        sourceId?: string | undefined;
    }>, "many">>;
}, "strict", z.ZodTypeAny, {
    project: {
        name: string;
        sourceId: string;
        status?: string | undefined;
        description?: string | undefined;
        summary?: string | undefined;
        provenance?: {
            provider: string;
            sourceUrl: string;
            sourceIdentifier: string;
        } | undefined;
    };
    relations: {
        kind: "blocks" | "related";
        targetWorkItemId: string;
        sourceWorkItemId: string;
        sourceId?: string | undefined;
    }[];
    milestones: {
        name: string;
        sourceId: string;
        description?: string | undefined;
        targetDate?: string | undefined;
        provenance?: {
            provider: string;
            sourceUrl: string;
            sourceIdentifier: string;
        } | undefined;
    }[];
    teamRef: string;
    defaultStatus: string;
    workItems: {
        title: string;
        sourceId: string;
        status?: string | undefined;
        description?: string | undefined;
        priority?: "none" | "urgent" | "high" | "medium" | "low" | undefined;
        dueDate?: string | undefined;
        labels?: string[] | undefined;
        provenance?: {
            provider: string;
            sourceUrl: string;
            sourceIdentifier: string;
        } | undefined;
        milestoneSourceId?: string | undefined;
        parentSourceId?: string | undefined;
    }[];
}, {
    project: {
        name: string;
        sourceId: string;
        status?: string | undefined;
        description?: string | undefined;
        summary?: string | undefined;
        provenance?: {
            provider: string;
            sourceUrl: string;
            sourceIdentifier: string;
        } | undefined;
    };
    teamRef: string;
    defaultStatus: string;
    relations?: {
        kind: "blocks" | "related";
        targetWorkItemId: string;
        sourceWorkItemId: string;
        sourceId?: string | undefined;
    }[] | undefined;
    milestones?: {
        name: string;
        sourceId: string;
        description?: string | undefined;
        targetDate?: string | undefined;
        provenance?: {
            provider: string;
            sourceUrl: string;
            sourceIdentifier: string;
        } | undefined;
    }[] | undefined;
    workItems?: {
        title: string;
        sourceId: string;
        status?: string | undefined;
        description?: string | undefined;
        priority?: "none" | "urgent" | "high" | "medium" | "low" | undefined;
        dueDate?: string | undefined;
        labels?: string[] | undefined;
        provenance?: {
            provider: string;
            sourceUrl: string;
            sourceIdentifier: string;
        } | undefined;
        milestoneSourceId?: string | undefined;
        parentSourceId?: string | undefined;
    }[] | undefined;
}>;
export type ProjectImportInput = z.infer<typeof projectImportSchema>;
export declare const normalizedProjectImportPlanSchema: z.ZodObject<{
    teamRef: z.ZodString;
    defaultStatus: z.ZodString;
    project: z.ZodObject<{
        sourceId: z.ZodString;
        name: z.ZodString;
        summary: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        status: z.ZodOptional<z.ZodString>;
        provenance: z.ZodOptional<z.ZodObject<{
            provider: z.ZodString;
            sourceUrl: z.ZodString;
            sourceIdentifier: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            provider: string;
            sourceUrl: string;
            sourceIdentifier: string;
        }, {
            provider: string;
            sourceUrl: string;
            sourceIdentifier: string;
        }>>;
    }, "strict", z.ZodTypeAny, {
        name: string;
        sourceId: string;
        status?: string | undefined;
        description?: string | undefined;
        summary?: string | undefined;
        provenance?: {
            provider: string;
            sourceUrl: string;
            sourceIdentifier: string;
        } | undefined;
    }, {
        name: string;
        sourceId: string;
        status?: string | undefined;
        description?: string | undefined;
        summary?: string | undefined;
        provenance?: {
            provider: string;
            sourceUrl: string;
            sourceIdentifier: string;
        } | undefined;
    }>;
    milestones: z.ZodDefault<z.ZodArray<z.ZodObject<{
        sourceId: z.ZodString;
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        targetDate: z.ZodOptional<z.ZodString>;
        provenance: z.ZodOptional<z.ZodObject<{
            provider: z.ZodString;
            sourceUrl: z.ZodString;
            sourceIdentifier: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            provider: string;
            sourceUrl: string;
            sourceIdentifier: string;
        }, {
            provider: string;
            sourceUrl: string;
            sourceIdentifier: string;
        }>>;
    }, "strict", z.ZodTypeAny, {
        name: string;
        sourceId: string;
        description?: string | undefined;
        targetDate?: string | undefined;
        provenance?: {
            provider: string;
            sourceUrl: string;
            sourceIdentifier: string;
        } | undefined;
    }, {
        name: string;
        sourceId: string;
        description?: string | undefined;
        targetDate?: string | undefined;
        provenance?: {
            provider: string;
            sourceUrl: string;
            sourceIdentifier: string;
        } | undefined;
    }>, "many">>;
} & {
    schemaVersion: z.ZodLiteral<1>;
    workItems: z.ZodArray<z.ZodObject<{
        sourceId: z.ZodString;
        title: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        dueDate: z.ZodOptional<z.ZodString>;
        milestoneSourceId: z.ZodOptional<z.ZodString>;
        parentSourceId: z.ZodOptional<z.ZodString>;
        provenance: z.ZodOptional<z.ZodObject<{
            provider: z.ZodString;
            sourceUrl: z.ZodString;
            sourceIdentifier: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            provider: string;
            sourceUrl: string;
            sourceIdentifier: string;
        }, {
            provider: string;
            sourceUrl: string;
            sourceIdentifier: string;
        }>>;
    } & {
        status: z.ZodString;
        priority: z.ZodEnum<["none", "low", "medium", "high", "urgent"]>;
        labels: z.ZodArray<z.ZodString, "many">;
    }, "strict", z.ZodTypeAny, {
        status: string;
        title: string;
        priority: "none" | "urgent" | "high" | "medium" | "low";
        labels: string[];
        sourceId: string;
        description?: string | undefined;
        dueDate?: string | undefined;
        provenance?: {
            provider: string;
            sourceUrl: string;
            sourceIdentifier: string;
        } | undefined;
        milestoneSourceId?: string | undefined;
        parentSourceId?: string | undefined;
    }, {
        status: string;
        title: string;
        priority: "none" | "urgent" | "high" | "medium" | "low";
        labels: string[];
        sourceId: string;
        description?: string | undefined;
        dueDate?: string | undefined;
        provenance?: {
            provider: string;
            sourceUrl: string;
            sourceIdentifier: string;
        } | undefined;
        milestoneSourceId?: string | undefined;
        parentSourceId?: string | undefined;
    }>, "many">;
    relations: z.ZodArray<z.ZodObject<{
        sourceWorkItemId: z.ZodString;
        targetWorkItemId: z.ZodString;
        kind: z.ZodEnum<["blocks", "related"]>;
    } & {
        sourceId: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        kind: "blocks" | "related";
        targetWorkItemId: string;
        sourceId: string;
        sourceWorkItemId: string;
    }, {
        kind: "blocks" | "related";
        targetWorkItemId: string;
        sourceId: string;
        sourceWorkItemId: string;
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    project: {
        name: string;
        sourceId: string;
        status?: string | undefined;
        description?: string | undefined;
        summary?: string | undefined;
        provenance?: {
            provider: string;
            sourceUrl: string;
            sourceIdentifier: string;
        } | undefined;
    };
    relations: {
        kind: "blocks" | "related";
        targetWorkItemId: string;
        sourceId: string;
        sourceWorkItemId: string;
    }[];
    milestones: {
        name: string;
        sourceId: string;
        description?: string | undefined;
        targetDate?: string | undefined;
        provenance?: {
            provider: string;
            sourceUrl: string;
            sourceIdentifier: string;
        } | undefined;
    }[];
    teamRef: string;
    defaultStatus: string;
    workItems: {
        status: string;
        title: string;
        priority: "none" | "urgent" | "high" | "medium" | "low";
        labels: string[];
        sourceId: string;
        description?: string | undefined;
        dueDate?: string | undefined;
        provenance?: {
            provider: string;
            sourceUrl: string;
            sourceIdentifier: string;
        } | undefined;
        milestoneSourceId?: string | undefined;
        parentSourceId?: string | undefined;
    }[];
    schemaVersion: 1;
}, {
    project: {
        name: string;
        sourceId: string;
        status?: string | undefined;
        description?: string | undefined;
        summary?: string | undefined;
        provenance?: {
            provider: string;
            sourceUrl: string;
            sourceIdentifier: string;
        } | undefined;
    };
    relations: {
        kind: "blocks" | "related";
        targetWorkItemId: string;
        sourceId: string;
        sourceWorkItemId: string;
    }[];
    teamRef: string;
    defaultStatus: string;
    workItems: {
        status: string;
        title: string;
        priority: "none" | "urgent" | "high" | "medium" | "low";
        labels: string[];
        sourceId: string;
        description?: string | undefined;
        dueDate?: string | undefined;
        provenance?: {
            provider: string;
            sourceUrl: string;
            sourceIdentifier: string;
        } | undefined;
        milestoneSourceId?: string | undefined;
        parentSourceId?: string | undefined;
    }[];
    schemaVersion: 1;
    milestones?: {
        name: string;
        sourceId: string;
        description?: string | undefined;
        targetDate?: string | undefined;
        provenance?: {
            provider: string;
            sourceUrl: string;
            sourceIdentifier: string;
        } | undefined;
    }[] | undefined;
}>;
export declare const applyProjectImportSchema: z.ZodObject<{
    contentHash: z.ZodString;
    plan: z.ZodObject<{
        teamRef: z.ZodString;
        defaultStatus: z.ZodString;
        project: z.ZodObject<{
            sourceId: z.ZodString;
            name: z.ZodString;
            summary: z.ZodOptional<z.ZodString>;
            description: z.ZodOptional<z.ZodString>;
            status: z.ZodOptional<z.ZodString>;
            provenance: z.ZodOptional<z.ZodObject<{
                provider: z.ZodString;
                sourceUrl: z.ZodString;
                sourceIdentifier: z.ZodString;
            }, "strict", z.ZodTypeAny, {
                provider: string;
                sourceUrl: string;
                sourceIdentifier: string;
            }, {
                provider: string;
                sourceUrl: string;
                sourceIdentifier: string;
            }>>;
        }, "strict", z.ZodTypeAny, {
            name: string;
            sourceId: string;
            status?: string | undefined;
            description?: string | undefined;
            summary?: string | undefined;
            provenance?: {
                provider: string;
                sourceUrl: string;
                sourceIdentifier: string;
            } | undefined;
        }, {
            name: string;
            sourceId: string;
            status?: string | undefined;
            description?: string | undefined;
            summary?: string | undefined;
            provenance?: {
                provider: string;
                sourceUrl: string;
                sourceIdentifier: string;
            } | undefined;
        }>;
        milestones: z.ZodDefault<z.ZodArray<z.ZodObject<{
            sourceId: z.ZodString;
            name: z.ZodString;
            description: z.ZodOptional<z.ZodString>;
            targetDate: z.ZodOptional<z.ZodString>;
            provenance: z.ZodOptional<z.ZodObject<{
                provider: z.ZodString;
                sourceUrl: z.ZodString;
                sourceIdentifier: z.ZodString;
            }, "strict", z.ZodTypeAny, {
                provider: string;
                sourceUrl: string;
                sourceIdentifier: string;
            }, {
                provider: string;
                sourceUrl: string;
                sourceIdentifier: string;
            }>>;
        }, "strict", z.ZodTypeAny, {
            name: string;
            sourceId: string;
            description?: string | undefined;
            targetDate?: string | undefined;
            provenance?: {
                provider: string;
                sourceUrl: string;
                sourceIdentifier: string;
            } | undefined;
        }, {
            name: string;
            sourceId: string;
            description?: string | undefined;
            targetDate?: string | undefined;
            provenance?: {
                provider: string;
                sourceUrl: string;
                sourceIdentifier: string;
            } | undefined;
        }>, "many">>;
    } & {
        schemaVersion: z.ZodLiteral<1>;
        workItems: z.ZodArray<z.ZodObject<{
            sourceId: z.ZodString;
            title: z.ZodString;
            description: z.ZodOptional<z.ZodString>;
            dueDate: z.ZodOptional<z.ZodString>;
            milestoneSourceId: z.ZodOptional<z.ZodString>;
            parentSourceId: z.ZodOptional<z.ZodString>;
            provenance: z.ZodOptional<z.ZodObject<{
                provider: z.ZodString;
                sourceUrl: z.ZodString;
                sourceIdentifier: z.ZodString;
            }, "strict", z.ZodTypeAny, {
                provider: string;
                sourceUrl: string;
                sourceIdentifier: string;
            }, {
                provider: string;
                sourceUrl: string;
                sourceIdentifier: string;
            }>>;
        } & {
            status: z.ZodString;
            priority: z.ZodEnum<["none", "low", "medium", "high", "urgent"]>;
            labels: z.ZodArray<z.ZodString, "many">;
        }, "strict", z.ZodTypeAny, {
            status: string;
            title: string;
            priority: "none" | "urgent" | "high" | "medium" | "low";
            labels: string[];
            sourceId: string;
            description?: string | undefined;
            dueDate?: string | undefined;
            provenance?: {
                provider: string;
                sourceUrl: string;
                sourceIdentifier: string;
            } | undefined;
            milestoneSourceId?: string | undefined;
            parentSourceId?: string | undefined;
        }, {
            status: string;
            title: string;
            priority: "none" | "urgent" | "high" | "medium" | "low";
            labels: string[];
            sourceId: string;
            description?: string | undefined;
            dueDate?: string | undefined;
            provenance?: {
                provider: string;
                sourceUrl: string;
                sourceIdentifier: string;
            } | undefined;
            milestoneSourceId?: string | undefined;
            parentSourceId?: string | undefined;
        }>, "many">;
        relations: z.ZodArray<z.ZodObject<{
            sourceWorkItemId: z.ZodString;
            targetWorkItemId: z.ZodString;
            kind: z.ZodEnum<["blocks", "related"]>;
        } & {
            sourceId: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            kind: "blocks" | "related";
            targetWorkItemId: string;
            sourceId: string;
            sourceWorkItemId: string;
        }, {
            kind: "blocks" | "related";
            targetWorkItemId: string;
            sourceId: string;
            sourceWorkItemId: string;
        }>, "many">;
    }, "strict", z.ZodTypeAny, {
        project: {
            name: string;
            sourceId: string;
            status?: string | undefined;
            description?: string | undefined;
            summary?: string | undefined;
            provenance?: {
                provider: string;
                sourceUrl: string;
                sourceIdentifier: string;
            } | undefined;
        };
        relations: {
            kind: "blocks" | "related";
            targetWorkItemId: string;
            sourceId: string;
            sourceWorkItemId: string;
        }[];
        milestones: {
            name: string;
            sourceId: string;
            description?: string | undefined;
            targetDate?: string | undefined;
            provenance?: {
                provider: string;
                sourceUrl: string;
                sourceIdentifier: string;
            } | undefined;
        }[];
        teamRef: string;
        defaultStatus: string;
        workItems: {
            status: string;
            title: string;
            priority: "none" | "urgent" | "high" | "medium" | "low";
            labels: string[];
            sourceId: string;
            description?: string | undefined;
            dueDate?: string | undefined;
            provenance?: {
                provider: string;
                sourceUrl: string;
                sourceIdentifier: string;
            } | undefined;
            milestoneSourceId?: string | undefined;
            parentSourceId?: string | undefined;
        }[];
        schemaVersion: 1;
    }, {
        project: {
            name: string;
            sourceId: string;
            status?: string | undefined;
            description?: string | undefined;
            summary?: string | undefined;
            provenance?: {
                provider: string;
                sourceUrl: string;
                sourceIdentifier: string;
            } | undefined;
        };
        relations: {
            kind: "blocks" | "related";
            targetWorkItemId: string;
            sourceId: string;
            sourceWorkItemId: string;
        }[];
        teamRef: string;
        defaultStatus: string;
        workItems: {
            status: string;
            title: string;
            priority: "none" | "urgent" | "high" | "medium" | "low";
            labels: string[];
            sourceId: string;
            description?: string | undefined;
            dueDate?: string | undefined;
            provenance?: {
                provider: string;
                sourceUrl: string;
                sourceIdentifier: string;
            } | undefined;
            milestoneSourceId?: string | undefined;
            parentSourceId?: string | undefined;
        }[];
        schemaVersion: 1;
        milestones?: {
            name: string;
            sourceId: string;
            description?: string | undefined;
            targetDate?: string | undefined;
            provenance?: {
                provider: string;
                sourceUrl: string;
                sourceIdentifier: string;
            } | undefined;
        }[] | undefined;
    }>;
}, "strict", z.ZodTypeAny, {
    contentHash: string;
    plan: {
        project: {
            name: string;
            sourceId: string;
            status?: string | undefined;
            description?: string | undefined;
            summary?: string | undefined;
            provenance?: {
                provider: string;
                sourceUrl: string;
                sourceIdentifier: string;
            } | undefined;
        };
        relations: {
            kind: "blocks" | "related";
            targetWorkItemId: string;
            sourceId: string;
            sourceWorkItemId: string;
        }[];
        milestones: {
            name: string;
            sourceId: string;
            description?: string | undefined;
            targetDate?: string | undefined;
            provenance?: {
                provider: string;
                sourceUrl: string;
                sourceIdentifier: string;
            } | undefined;
        }[];
        teamRef: string;
        defaultStatus: string;
        workItems: {
            status: string;
            title: string;
            priority: "none" | "urgent" | "high" | "medium" | "low";
            labels: string[];
            sourceId: string;
            description?: string | undefined;
            dueDate?: string | undefined;
            provenance?: {
                provider: string;
                sourceUrl: string;
                sourceIdentifier: string;
            } | undefined;
            milestoneSourceId?: string | undefined;
            parentSourceId?: string | undefined;
        }[];
        schemaVersion: 1;
    };
}, {
    contentHash: string;
    plan: {
        project: {
            name: string;
            sourceId: string;
            status?: string | undefined;
            description?: string | undefined;
            summary?: string | undefined;
            provenance?: {
                provider: string;
                sourceUrl: string;
                sourceIdentifier: string;
            } | undefined;
        };
        relations: {
            kind: "blocks" | "related";
            targetWorkItemId: string;
            sourceId: string;
            sourceWorkItemId: string;
        }[];
        teamRef: string;
        defaultStatus: string;
        workItems: {
            status: string;
            title: string;
            priority: "none" | "urgent" | "high" | "medium" | "low";
            labels: string[];
            sourceId: string;
            description?: string | undefined;
            dueDate?: string | undefined;
            provenance?: {
                provider: string;
                sourceUrl: string;
                sourceIdentifier: string;
            } | undefined;
            milestoneSourceId?: string | undefined;
            parentSourceId?: string | undefined;
        }[];
        schemaVersion: 1;
        milestones?: {
            name: string;
            sourceId: string;
            description?: string | undefined;
            targetDate?: string | undefined;
            provenance?: {
                provider: string;
                sourceUrl: string;
                sourceIdentifier: string;
            } | undefined;
        }[] | undefined;
    };
}>;
export type NormalizedProjectImportPlan = z.infer<typeof normalizedProjectImportPlanSchema>;
export type PreparedProjectImport = {
    contentHash: string;
    plan: NormalizedProjectImportPlan;
    counts: {
        projects: 1;
        milestones: number;
        workItems: number;
        relations: number;
    };
    sideEffectFree: true;
};
export declare function slugify(value: string): string;
export declare function projectReference(project: Pick<ProjectRow, 'id' | 'name'>, teamKey: string): string;
export declare function workItemReference(item: Pick<WorkItemRow, 'team_key' | 'number'>): string;
export declare function prepareProjectImport(raw: ProjectImportInput): PreparedProjectImport;
export declare function applyProjectImport(client: WorkMeshClient, raw: z.infer<typeof applyProjectImportSchema>): Promise<unknown>;
export declare function getWorkMeshContext(client: WorkMeshClient, prepared: PreparedDiscovery): Promise<unknown>;
export declare function resolveIdentifier(client: WorkMeshClient, input: IdentifierInput): Promise<unknown>;
export {};
