export interface SceneAsset {
  id: number;
  text: string;
  context: string;
  visual_prompt: string;
  search_query: string;
  pexels_url: string;
  google_video_search_url: string;
  video_url?: string;
  pexels_author?: string;
  pexels_author_url?: string;
  pexels_original_url?: string;
}

export interface VideoIdea {
  title: string;
  hook: string;
  description: string;
  estimated_length_minutes: number;
}

export interface GeneratedScene {
  id: number;
  timestamp: string;
  voiceover: string;
  text_on_screen: string;
  visual_asset: string;
  search_query: string;
  pexels_url: string;
  google_video_search_url: string;
  video_url?: string;
  pexels_author?: string;
  pexels_author_url?: string;
  pexels_original_url?: string;
}

export interface GeneratedScript {
  hook_section: {
    hook_text: string;
    reaction_footage: string;
  };
  roadmap: GeneratedScene[];
}
