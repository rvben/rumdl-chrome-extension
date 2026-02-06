// Types shared between content script and service worker

export interface LintWarning {
  rule_name?: string;
  message: string;
  line: number;
  column: number;
  end_line: number;
  end_column: number;
  severity: 'error' | 'warning' | 'info';
  fix?: LintFix;
}

export interface LintFix {
  range: {
    start: number;
    end: number;
  };
  replacement: string;
}

export const VALID_FLAVORS = ['standard', 'mkdocs', 'mdx', 'quarto', 'obsidian'] as const;

export type Flavor = typeof VALID_FLAVORS[number];

export interface LinterConfig {
  disable?: string[];
  enable?: string[];
  'line-length'?: number;
  flavor?: Flavor;
  [key: string]: unknown; // For rule-specific configs
}

export interface RumdlConfig {
  enabled: boolean;
  flavor: Flavor;
  lineLength: number;
  disabledRules: string[];
  enabledRules: string[];
  ruleConfigs: Record<string, unknown>;
  autoFormat: boolean;
  showGutterIcons: boolean;
  reflow: boolean;
}

export const DEFAULT_CONFIG: RumdlConfig = {
  enabled: true,
  flavor: 'standard',
  lineLength: 80,
  disabledRules: ['MD041'], // First heading rule often not wanted on GitHub
  enabledRules: [],
  ruleConfigs: {},
  autoFormat: false,
  showGutterIcons: true,
  reflow: false
};

export interface RuleInfo {
  name: string;
  description: string;
}

// Service worker health status
export interface ServiceWorkerStatus {
  wasmInitialized: boolean;
  wasmError: string | null;
  version: string | null;
}

// Message types for communication between content script and service worker
export type MessageType =
  | { type: 'LINT'; content: string; config: LinterConfig }
  | { type: 'FIX'; content: string; config: LinterConfig }
  | { type: 'GET_CONFIG' }
  | { type: 'SET_CONFIG'; config: Partial<RumdlConfig> }
  | { type: 'GET_VERSION' }
  | { type: 'GET_RULES' }
  | { type: 'GET_STATUS' }
  | { type: 'PING' };

export type MessageResponse =
  | { type: 'LINT_RESULT'; warnings: LintWarning[] }
  | { type: 'FIX_RESULT'; content: string }
  | { type: 'CONFIG_RESULT'; config: RumdlConfig }
  | { type: 'VERSION_RESULT'; version: string }
  | { type: 'RULES_RESULT'; rules: RuleInfo[] }
  | { type: 'STATUS_RESULT'; status: ServiceWorkerStatus }
  | { type: 'PONG' }
  | { type: 'ERROR'; message: string };
