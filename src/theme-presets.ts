/* =====================================================================
 * 主题包 —— 移植自 Xmind v25.04 内置主题（static/styles/themes/*.json）
 * 由 scripts-gen-themes.cjs 生成：43 个官方主题转为枝桠 ThemePreset。
 * 映射：centralTopic→root / mainTopic→level1 / subTopic→deeper /
 *      map.svg:fill→paper / fo:color→ink / 强调色→六支功能色（色相旋转）。
 * ===================================================================== */
import type { ThemePreset } from './edges';

export const PORTED_PRESETS: ThemePreset[] = [
  {
    id: 'x-B01',
    label: '黑板',
    paper: '#1e2933',
    ink: '#e5eef9',
    roles: {
      root: {
        shape: 'roundedRect',
        text: '#e5eef9',
        lineClass: 'fold'
      },
      level1: {
        shape: 'underline',
        text: '#e5eef9',
        lineClass: 'elbow'
      },
      deeper: {
        shape: 'roundedRect',
        text: '#e5eef9',
        lineClass: 'elbow'
      }
    }
  },
  {
    id: 'x-B02',
    label: '素白',
    paper: '#FFF',
    ink: '#111111',
    roles: {
      root: {
        shape: 'ellipserect',
        text: '#111111'
      },
      level1: {
        shape: 'underline',
        text: '#111111'
      },
      deeper: {
        shape: 'roundedRect',
        text: '#111111'
      }
    }
  },
  {
    id: 'x-B03',
    label: '雏菊',
    paper: '#FAFAFF',
    ink: '#333333',
    branchColors: [
      '#c8a540',
      '#c86a40',
      '#b0c840',
      '#c84051',
      '#75c840',
      '#4063c8'
    ],
    roles: {
      root: {
        shape: 'ellipserect',
        fill: '#FFC009',
        text: '#333333',
        lineClass: 'curve'
      },
      level1: {
        shape: 'underline',
        text: '#333333',
        lineClass: 'elbow'
      },
      deeper: {
        shape: 'roundedRect',
        text: '#333333',
        lineClass: 'elbow'
      }
    }
  },
  {
    id: 'x-F01',
    label: '浅海',
    paper: '#F2F6F9',
    branchColors: [
      '#3097a5',
      '#30a580',
      '#3064a5',
      '#30a54d',
      '#3032a5',
      '#a53e30'
    ],
    roles: {
      root: {
        fill: '#016064',
        lineClass: 'curve'
      },
      level1: {
        shape: 'roundedRect',
        fill: '#01BBD4',
        text: '#F8F7F7',
        lineClass: 'elbow'
      },
      deeper: {
        shape: 'roundedRect',
        fill: '#EEF0F1',
        text: '#016064'
      }
    }
  },
  {
    id: 'x-F02',
    label: '赤印',
    paper: '#F9F9F9',
    branchColors: [
      '#c84142',
      '#c8417c',
      '#c87b41',
      '#c841b7',
      '#c8b541',
      '#41c8c7'
    ],
    roles: {
      root: {
        fill: '#E32C2D'
      },
      level1: {
        shape: 'underline',
        text: '#111111'
      },
      deeper: {
        text: '#111111'
      }
    }
  },
  {
    id: 'x-F03',
    label: '夜航',
    paper: '#23273E',
    branchColors: [
      '#36a4ba',
      '#36ba97',
      '#366aba',
      '#36ba5e',
      '#3b36ba',
      '#ba4c36'
    ],
    roles: {
      root: {
        shape: 'rect',
        fill: '#05C4EB',
        lineClass: 'straight'
      },
      level1: {
        shape: 'rect',
        text: '#ECECF4',
        lineClass: 'straight'
      },
      deeper: {
        shape: 'rect',
        text: '#BED7DD',
        lineClass: 'straight'
      }
    }
  },
  {
    id: 'x-L01',
    label: '石青',
    paper: '#ECF4F9',
    branchColors: [
      '#557db4',
      '#55a6b4',
      '#5655b4',
      '#55b499',
      '#7f55b4',
      '#b48c55'
    ],
    roles: {
      root: {
        fill: '#35455B',
        lineClass: 'elbow'
      },
      level1: {
        fill: '#84A1C9',
        text: '#FFFFFF'
      },
      deeper: {
        shape: 'roundedRect',
        fill: '#E2E9F1',
        text: '#35455B'
      }
    }
  },
  {
    id: 'x-L02',
    label: '新绿',
    paper: '#ECF5E7',
    ink: '#FF9F00',
    branchColors: [
      '#a96060',
      '#a96080',
      '#a98060',
      '#a960a0',
      '#a9a060',
      '#60a9a9'
    ],
    roles: {
      root: {
        fill: '#FFFFFF',
        text: '#FF9F00'
      },
      level1: {
        fill: '#ffffff',
        text: '#FF9F00'
      },
      deeper: {
        shape: 'roundedRect',
        fill: '#F5FAEE',
        text: '#000000'
      }
    }
  },
  {
    id: 'x-L03',
    label: '苔色',
    paper: '#545753',
    branchColors: [
      '#60a978',
      '#67a960',
      '#60a998',
      '#87a960',
      '#609ba9',
      '#a96091'
    ],
    roles: {
      root: {
        fill: '#68A47C',
        lineClass: 'elbow'
      },
      level1: {
        text: '#FFFFFF'
      },
      deeper: {
        text: '#FFFFFF'
      }
    }
  },
  {
    id: 'x-L04',
    label: '夜紫',
    paper: '#261B39',
    roles: {
      root: {
        shape: 'roundedRect'
      },
      level1: {
        text: '#F8F7F7'
      },
      deeper: {
        text: '#F8F7F7'
      }
    }
  },
  {
    id: 'x-L05',
    label: '深空',
    paper: '#0B0418',
    branchColors: [
      '#303e9f',
      '#306e9f',
      '#52309f',
      '#309e9f',
      '#82309f',
      '#9f9130'
    ],
    roles: {
      root: {
        shape: 'roundedRect',
        fill: '#303E9F'
      },
      level1: {
        text: '#FFFFFF'
      },
      deeper: {
        shape: 'roundedRect',
        fill: '#1D283E',
        text: '#FFFFFF'
      }
    }
  },
  {
    id: 'x-L06',
    label: '墨蓝',
    paper: '#0A020E',
    ink: '#B6D9FE',
    branchColors: [
      '#273686',
      '#275f86',
      '#422786',
      '#278684',
      '#6b2786',
      '#867827'
    ],
    roles: {
      root: {
        fill: '#0D143A',
        text: '#B6D9FE',
        lineClass: 'elbow'
      },
      level1: {
        fill: '#0D143A',
        text: '#B6D9FE'
      },
      deeper: {
        text: '#B6D9FE'
      }
    }
  },
  {
    id: 'x-M01',
    label: '朱红',
    paper: '#FFFFFF',
    branchColors: [
      '#c84149',
      '#c84183',
      '#c87441',
      '#c841be',
      '#c8ae41',
      '#41c8c0'
    ],
    roles: {
      root: {
        fill: '#F6212D'
      },
      level1: {},
      deeper: {
        shape: 'roundedRect',
        fill: '#F8F7F7',
        text: '#333333'
      }
    }
  },
  {
    id: 'x-M02',
    label: '湖蓝',
    branchColors: [
      '#2f7ba4',
      '#2fa49a',
      '#2f48a4',
      '#2fa468',
      '#492fa4',
      '#a4582f'
    ],
    roles: {
      root: {
        shape: 'roundedRect',
        fill: '#0288D1',
        lineClass: 'curve'
      },
      level1: {
        lineClass: 'elbow'
      },
      deeper: {
        shape: 'underline',
        text: '#333333',
        lineClass: 'elbow'
      }
    }
  },
  {
    id: 'x-M03',
    label: '素笺',
    paper: '#F7F7FA',
    ink: '#000000',
    branchColors: [
      '#a96060',
      '#a96080',
      '#a98060',
      '#a960a0',
      '#a9a060',
      '#60a9a9'
    ],
    roles: {
      root: {
        shape: 'roundedRect',
        fill: '#FFFFFF',
        text: '#000000'
      },
      level1: {
        shape: 'underline',
        text: '#091C34',
        lineClass: 'bight'
      },
      deeper: {
        text: '#091C34',
        lineClass: 'bight'
      }
    }
  },
  {
    id: 'x-M04',
    label: '晴空',
    paper: '#F5FAFF',
    branchColors: [
      '#41a5c8',
      '#41c8b0',
      '#416bc8',
      '#41c876',
      '#5241c8',
      '#c86441'
    ],
    roles: {
      root: {
        fill: '#5A729A',
        lineClass: 'elbow'
      },
      level1: {
        fill: '#96D2E7',
        text: '#434B54'
      },
      deeper: {
        text: '#434B54'
      }
    }
  },
  {
    id: 'x-M05',
    label: '白瓷',
    ink: '#333333',
    branchColors: [
      '#a96060',
      '#a96080',
      '#a98060',
      '#a960a0',
      '#a9a060',
      '#60a9a9'
    ],
    roles: {
      root: {
        fill: '#FFFFFF',
        text: '#333333'
      },
      level1: {
        fill: '#FFFFFF',
        text: '#333333',
        lineClass: 'curve'
      },
      deeper: {
        text: '#333333',
        lineClass: 'curve'
      }
    }
  },
  {
    id: 'x-M06',
    label: '浅灰',
    ink: '#333333',
    roles: {
      root: {
        text: '#333333'
      },
      level1: {
        text: '#333333',
        lineClass: 'curve'
      },
      deeper: {
        shape: 'roundedRect',
        text: '#333333',
        lineClass: 'curve'
      }
    }
  },
  {
    id: 'x-M07',
    label: '霜青',
    paper: '#EFF8FA',
    ink: '#44556E',
    branchColors: [
      '#a96060',
      '#a96080',
      '#a98060',
      '#a960a0',
      '#a9a060',
      '#60a9a9'
    ],
    roles: {
      root: {
        shape: 'ellipticrectangle',
        fill: '#FFFFFF',
        text: '#44556E',
        lineClass: 'fold'
      },
      level1: {
        shape: 'ellipticrectangle',
        fill: '#FFFFFF',
        text: '#44556E',
        lineClass: 'straight'
      },
      deeper: {
        shape: 'roundedRect',
        text: '#44556E',
        lineClass: 'straight'
      }
    }
  },
  {
    id: 'x-M08',
    label: '亚麻',
    paper: '#F1ECE6',
    branchColors: [
      '#a96060',
      '#a96080',
      '#a98060',
      '#a960a0',
      '#a9a060',
      '#60a9a9'
    ],
    roles: {
      root: {
        shape: 'ellipserect',
        fill: '#6078A0',
        lineClass: 'curve'
      },
      level1: {
        shape: 'circle',
        fill: '#FFFFFF',
        text: '#6078A0',
        lineClass: 'curve'
      },
      deeper: {
        shape: 'roundedRect',
        text: '#6078A0',
        lineClass: 'curve'
      }
    }
  },
  {
    id: 'x-M09',
    label: '桃粉',
    paper: '#FAD8DF',
    branchColors: [
      '#a96060',
      '#a96080',
      '#a98060',
      '#a960a0',
      '#a9a060',
      '#60a9a9'
    ],
    roles: {
      root: {
        shape: 'roundedhexagon',
        fill: '#318DE1'
      },
      level1: {
        shape: 'ellipticrectangle',
        fill: '#FFFFFF',
        text: '#434B54'
      },
      deeper: {
        shape: 'roundedRect',
        text: '#535353'
      }
    }
  },
  {
    id: 'x-M10',
    label: '石板',
    paper: '#AFBCCF',
    branchColors: [
      '#3f72af',
      '#3fa3af',
      '#3f41af',
      '#3faf8b',
      '#6d3faf',
      '#af7c3f'
    ],
    roles: {
      root: {
        shape: 'rect',
        fill: '#303D4D',
        lineClass: 'fold'
      },
      level1: {
        shape: 'rect',
        fill: '#3F72AF',
        text: '#FFFFFF',
        lineClass: 'fold'
      },
      deeper: {
        text: '#303D4D',
        lineClass: 'fold'
      }
    }
  },
  {
    id: 'x-M11',
    label: '海盐',
    paper: '#51A4B4',
    ink: '#333E4A',
    branchColors: [
      '#c89441',
      '#c85a41',
      '#c1c841',
      '#c84163',
      '#87c841',
      '#4175c8'
    ],
    roles: {
      root: {
        shape: 'ellipticrectangle',
        fill: '#FFFFFF',
        text: '#333E4A',
        lineClass: 'straight'
      },
      level1: {
        fill: '#FFE6BE'
      },
      deeper: {
        shape: 'roundedRect',
        text: '#FFFFFF'
      }
    }
  },
  {
    id: 'x-M12',
    label: '柠夜',
    paper: '#302934',
    ink: '#302934',
    branchColors: [
      '#9bc841',
      '#c8bb41',
      '#60c841',
      '#c88141',
      '#41c85d',
      '#6f41c8'
    ],
    roles: {
      root: {
        shape: 'ellipserect',
        fill: '#D1F786',
        text: '#302934',
        lineClass: 'fold'
      },
      level1: {
        shape: 'underline',
        text: '#FFFFFF',
        lineClass: 'bight'
      },
      deeper: {
        text: '#FFFFFF',
        lineClass: 'bight'
      }
    }
  },
  {
    id: 'x-M13',
    label: '暮灰',
    paper: '#161824',
    branchColors: [
      '#4c5c8c',
      '#4c788c',
      '#574c8c',
      '#4c8c85',
      '#744c8c',
      '#8c7c4c'
    ],
    roles: {
      root: {
        shape: 'ellipticrectangle',
        lineClass: 'fold'
      },
      level1: {
        fill: '#666972',
        text: '#FFFFFF',
        lineClass: 'fold'
      },
      deeper: {
        text: '#EFF0F3',
        lineClass: 'fold'
      }
    }
  },
  {
    id: 'x-M14',
    label: '炭黑',
    paper: '#000000',
    branchColors: [
      '#3d3d71',
      '#3d5371',
      '#533d71',
      '#3d6a71',
      '#6a3d71',
      '#71713d'
    ],
    roles: {
      root: {
        shape: 'roundedRect',
        fill: '#1B1B1D'
      },
      level1: {
        fill: '#3A3A3C',
        text: '#FFFFFF'
      },
      deeper: {
        shape: 'roundedRect',
        fill: '#636366',
        text: '#FFFFFF'
      }
    }
  },
  {
    id: 'x-M15',
    label: '暗室',
    paper: '#111111',
    ink: '#EEEEEE',
    roles: {
      root: {
        text: '#EEEEEE'
      },
      level1: {
        text: '#EEEEEE',
        lineClass: 'curve'
      },
      deeper: {
        text: '#FFFFFF',
        lineClass: 'curve'
      }
    }
  },
  {
    id: 'x-MT01',
    label: '薄荷',
    paper: '#F4F9FA',
    ink: '#F4F9FA',
    branchColors: [
      '#39bfc2',
      '#39c28a',
      '#3984c2',
      '#39c24e',
      '#3948c2',
      '#c23c39'
    ],
    roles: {
      root: {
        fill: '#39BFC2',
        text: '#F4F9FA',
        lineClass: 'bight'
      },
      level1: {
        text: '#39BFC2',
        lineClass: 'bight'
      },
      deeper: {
        shape: 'roundedRect',
        text: '#8793A5',
        lineClass: 'bight'
      }
    }
  },
  {
    id: 'x-MT02',
    label: '麦金',
    paper: '#F3EDCD',
    branchColors: [
      '#a96060',
      '#a96080',
      '#a98060',
      '#a960a0',
      '#a9a060',
      '#60a9a9'
    ],
    roles: {
      root: {
        fill: '#CEA61C',
        lineClass: 'bight'
      },
      level1: {
        fill: '#FFFFFF',
        text: '#000000',
        lineClass: 'elbow'
      },
      deeper: {
        shape: 'roundedRect'
      }
    }
  },
  {
    id: 'x-MT03',
    label: '珊瑚',
    paper: '#F4F9FA',
    branchColors: [
      '#c84141',
      '#c8417c',
      '#c87c41',
      '#c841b6',
      '#c8b641',
      '#41c8c8'
    ],
    roles: {
      root: {
        fill: '#FF5252'
      },
      level1: {
        text: '#333333'
      },
      deeper: {
        text: '#333333'
      }
    }
  },
  {
    id: 'x-MT04',
    label: '靛蓝',
    paper: '#F4F9FA',
    branchColors: [
      '#4051b5',
      '#4084b5',
      '#6240b5',
      '#40b5b4',
      '#9440b5',
      '#b5a440'
    ],
    roles: {
      root: {
        fill: '#4051B5'
      },
      level1: {
        text: '#4051B5'
      },
      deeper: {
        text: '#303E9F'
      }
    }
  },
  {
    id: 'x-O01',
    label: '清透',
    paper: '#EFF8FA',
    ink: '#44556E',
    branchColors: [
      '#a96060',
      '#a96080',
      '#a98060',
      '#a960a0',
      '#a9a060',
      '#60a9a9'
    ],
    roles: {
      root: {
        shape: 'ellipticrectangle',
        fill: '#FFFFFF',
        text: '#44556E',
        lineClass: 'elbow'
      },
      level1: {
        shape: 'ellipticrectangle',
        fill: '#FFFFFF',
        text: '#44556E',
        lineClass: 'elbow'
      },
      deeper: {
        shape: 'roundedRect',
        text: '#44556E',
        lineClass: 'straight'
      }
    }
  },
  {
    id: 'x-O02',
    label: '杏子',
    paper: '#FFDBC6',
    ink: '#353739',
    branchColors: [
      '#ab835e',
      '#ab625e',
      '#aba45e',
      '#ab5e7c',
      '#91ab5e',
      '#5e87ab'
    ],
    roles: {
      root: {
        shape: 'ellipserect',
        fill: '#FFFFFF',
        text: '#353739'
      },
      level1: {
        fill: '#EAE0D7',
        text: '#353739',
        lineClass: 'elbow'
      },
      deeper: {
        text: '#353739'
      }
    }
  },
  {
    id: 'x-O03',
    label: '森绿',
    paper: '#F9F9F9',
    branchColors: [
      '#5bae63',
      '#77ae5b',
      '#5bae87',
      '#9bae5b',
      '#5baeab',
      '#ae5ba6'
    ],
    roles: {
      root: {
        shape: 'roundedRect',
        fill: '#2B592F'
      },
      level1: {
        shape: 'roundedRect',
        fill: '#5BAE63',
        text: '#F8F7F7'
      },
      deeper: {
        shape: 'roundedRect',
        fill: '#EBEBEB',
        text: '#111111'
      }
    }
  },
  {
    id: 'x-O04',
    label: '橙蓝',
    paper: '#FFFFFF',
    ink: '#F8F7F7',
    branchColors: [
      '#2f7ba4',
      '#2fa49a',
      '#2f48a4',
      '#2fa468',
      '#492fa4',
      '#a4582f'
    ],
    roles: {
      root: {
        shape: 'roundedRect',
        fill: '#FF3C00',
        text: '#F8F7F7',
        lineClass: 'elbow'
      },
      level1: {
        shape: 'roundedRect',
        fill: '#0288D1',
        text: '#F8F7F7'
      },
      deeper: {
        shape: 'roundedRect',
        text: '#111111'
      }
    }
  },
  {
    id: 'x-O05',
    label: '暮钢',
    paper: '#343643',
    ink: '#50FA7B',
    roles: {
      root: {
        shape: 'rect',
        text: '#50FA7B',
        lineClass: 'elbow'
      },
      level1: {
        shape: 'rect',
        text: '#50FA7B'
      },
      deeper: {
        shape: 'rect',
        text: '#C0C0C5'
      }
    }
  },
  {
    id: 'x-O06',
    label: '月灰',
    paper: '#21273D',
    ink: '#21273D',
    branchColors: [
      '#577bb3',
      '#57a3b3',
      '#5a57b3',
      '#57b39a',
      '#8257b3',
      '#b38e57'
    ],
    roles: {
      root: {
        shape: 'ellipserect',
        fill: '#E1E5EC',
        text: '#21273D',
        lineClass: 'elbow'
      },
      level1: {
        shape: 'ellipserect',
        fill: '#C8D4E6',
        text: '#21273D',
        lineClass: 'elbow'
      },
      deeper: {
        text: '#FFFFFF'
      }
    }
  },
  {
    id: 'x-T01',
    label: '绛金',
    ink: '#DCC691',
    branchColors: [
      '#b45555',
      '#b4557e',
      '#b47e55',
      '#b455a7',
      '#b4a755',
      '#55b4b4'
    ],
    roles: {
      root: {
        fill: '#B85F5F',
        text: '#DCC691',
        lineClass: 'elbow'
      },
      level1: {
        shape: 'underline',
        text: '#9B806B'
      },
      deeper: {
        text: '#434B54'
      }
    }
  },
  {
    id: 'x-T02',
    label: '夜蓝',
    paper: '#262D52',
    roles: {
      root: {
        shape: 'hexagon',
        lineClass: 'straight'
      },
      level1: {
        shape: 'hexagon',
        text: '#FFFFFF',
        lineClass: 'straight'
      },
      deeper: {
        text: '#FFFFFF',
        lineClass: 'straight'
      }
    }
  },
  {
    id: 'x-T03',
    label: '深青',
    paper: '#043742',
    ink: '#EEEEEE',
    roles: {
      root: {
        text: '#EEEEEE'
      },
      level1: {
        text: '#EEEEEE'
      },
      deeper: {
        shape: 'rect',
        text: '#EEEEEE'
      }
    }
  },
  {
    id: 'x-TL01',
    label: '叶绿',
    branchColors: [
      '#607da9',
      '#609da9',
      '#6260a9',
      '#60a996',
      '#8260a9',
      '#a98c60'
    ],
    roles: {
      root: {
        shape: 'ellipserect',
        fill: '#44B92D',
        lineClass: 'elbow'
      },
      level1: {
        shape: 'ellipserect',
        fill: '#8793A5',
        text: '#FFFFFF'
      },
      deeper: {
        shape: 'roundedRect',
        text: '#434B54'
      }
    }
  },
  {
    id: 'x-TL02',
    label: '葡萄',
    paper: '#EFF0F5',
    branchColors: [
      '#8956a2',
      '#6856a2',
      '#a2569a',
      '#5665a2',
      '#a25679',
      '#6fa256'
    ],
    roles: {
      root: {
        shape: 'ellipserect',
        fill: '#45006F',
        lineClass: 'elbow'
      },
      level1: {
        shape: 'ellipserect',
        fill: '#8956A2',
        text: '#FFFFFF'
      },
      deeper: {
        shape: 'roundedRect',
        fill: '#FFFFFF',
        text: '#35455B',
        lineClass: 'elbow'
      }
    }
  },
  {
    id: 'x-TL03',
    label: '夜幕',
    paper: '#1A2235',
    ink: '#FF9F00',
    roles: {
      root: {
        shape: 'ellipserect',
        text: '#FF9F00',
        lineClass: 'elbow'
      },
      level1: {
        shape: 'rect',
        text: '#DADCD0',
        lineClass: 'elbow'
      },
      deeper: {
        text: '#DADCD0'
      }
    }
  }
];

/* ---------- 运行时：自定义主题仓（localStorage）+ Xmind 主题双向转换 ---------- */
const LS_THEMES = 'zhiya.themes';

export function customThemes(): import('./edges').ThemePreset[] {
  try { return JSON.parse(localStorage.getItem(LS_THEMES) || '[]'); } catch { return []; }
}
export function addCustomTheme(p: import('./edges').ThemePreset): void {
  const list = customThemes();
  list.push(p);
  localStorage.setItem(LS_THEMES, JSON.stringify(list));
}

const LINE_MAP_RT: Record<string, string> = {
  curve: 'curve', straight: 'straight', elbow: 'elbow', fold: 'fold',
  bight: 'bight', brace: 'brace', roundedElbow: 'roundedElbow', roundedfold: 'roundedfold'
};

/** Xmind 主题 JSON（{name, content:{centralTopic/mainTopic/subTopic/map...}}）→ ThemePreset */
export function xmindThemeToPreset(json: unknown): import('./edges').ThemePreset | null {
  const j = json as { name?: string; content?: Record<string, { properties?: Record<string, string> }> } & Record<string, unknown>;
  const c = j?.content;
  if (!c || typeof c !== 'object') {
    // 兼容直接给 ThemePreset 形态
    const p = json as import('./edges').ThemePreset;
    return p && typeof p.id === 'string' && p.roles ? p : null;
  }
  const role = (name: string) => {
    const pr = c[name]?.properties ?? {};
    const out: { shape?: string; fill?: string; text?: string; lineClass?: string } = {};
    const sc = pr['shape-class'] ?? '';
    if (sc.startsWith('org.xmind.topicShape.')) out.shape = sc.slice('org.xmind.topicShape.'.length);
    if (pr['svg:fill'] && pr['svg:fill'] !== 'none') out.fill = pr['svg:fill'];
    if (pr['fo:color']) out.text = pr['fo:color'];
    const lc = pr['line-class'] ?? '';
    if (lc.startsWith('org.xmind.branchConnection.')) {
      const short = lc.slice('org.xmind.branchConnection.'.length);
      if (LINE_MAP_RT[short]) out.lineClass = LINE_MAP_RT[short]!;
    }
    return out;
  };
  const name = (j.name as string) || (c.name as string) || '自定义主题';
  const ml = c.map?.properties?.['multi-line-colors'] ?? c.map?.properties?.['color-list'];
  const branchColors = ml ? ml.split(/\s+/).filter(Boolean).slice(0, 6) : undefined;
  return {
    id: 'custom-' + Date.now().toString(36),
    label: name,
    ...(c.map?.properties?.['svg:fill'] ? { paper: c.map.properties['svg:fill'] } : {}),
    ...(role('centralTopic').text ? { ink: role('centralTopic').text! } : {}),
    ...(branchColors?.length ? { branchColors } : {}),
    roles: { root: role('centralTopic'), level1: role('mainTopic'), deeper: role('subTopic') }
  };
}

/** ThemePreset → Xmind 主题 JSON（与内置 themes/*.json 同构，可被 Xmind 侧工具读取） */
export function presetToXmindTheme(p: import('./edges').ThemePreset): string {
  const props = (r: { shape?: string; fill?: string; text?: string; lineClass?: string }) => {
    const out: Record<string, string> = {};
    if (r.shape) out['shape-class'] = 'org.xmind.topicShape.' + r.shape;
    if (r.fill) out['svg:fill'] = r.fill;
    if (r.text) out['fo:color'] = r.text;
    if (r.lineClass) out['line-class'] = 'org.xmind.branchConnection.' + r.lineClass;
    return out;
  };
  return JSON.stringify({
    name: p.label,
    content: {
      id: 'zhiya-' + p.id,
      name: p.label,
      map: { properties: { ...(p.paper ? { 'svg:fill': p.paper } : {}) }, type: 'map' },
      centralTopic: { properties: props(p.roles.root), type: 'centralTopic' },
      mainTopic: { properties: props(p.roles.level1), type: 'mainTopic' },
      subTopic: { properties: props(p.roles.deeper), type: 'subTopic' },
      relationship: { properties: {}, type: 'relationship' }
    }
  }, null, 2);
}
