/**
 * The platform's icon set. Every icon is a Font Awesome glyph, rendered as an
 * inline SVG that paints with currentColor, so a text-* class (or the tone
 * prop) is all it takes to put it in a brand colour. No glows, no gradients.
 *
 *   <Calendar className="h-4 w-4 text-rh-teal" />
 *   <Calendar tone="brand" className="h-4 w-4" />
 *   <Icon icon={faBone} tone="accent" />   // any other Font Awesome icon
 *
 * Export names describe the UI role (Loader2, CheckCircle2, ...) so screens
 * read the same as before; the mapping to Font Awesome lives below.
 * Generated mapping: keep names sorted when adding one.
 */
import * as React from 'react'
import type { IconDefinition } from '@fortawesome/free-solid-svg-icons'
import {
  faInstagram, faLinkedin, faWhatsapp, faXTwitter,
} from '@fortawesome/free-brands-svg-icons'
import {
  faAlignLeft, faArrowDown, faArrowLeft, faArrowRight, faArrowRightArrowLeft, faArrowRotateLeft,
  faArrowTrendDown, faArrowTrendUp, faArrowTurnDown, faArrowUp, faArrowUpRightFromSquare,
  faArrowsRotate, faAward, faBaby, faBan, faBars, faBell, faBolt, faBone, faBook, faBookOpen,
  faBox, faBoxArchive, faBoxOpen, faBrain, faBriefcase, faBuilding, faBullhorn, faBullseye,
  faCalendar, faCalendarCheck, faCalendarDay, faCalendarDays, faCalendarPlus, faCalendarWeek,
  faCalendarXmark, faCamera, faCameraRotate, faCar, faChartColumn, faChartLine, faCheck,
  faCheckDouble, faChevronDown, faChevronLeft, faChevronRight, faChevronUp, faCircle,
  faCircleCheck, faCircleExclamation, faCircleInfo, faCircleNotch, faCirclePlay,
  faCircleQuestion, faCircleXmark, faClipboardCheck, faClipboardList, faClock,
  faClockRotateLeft, faCloudArrowUp, faCode, faComment, faCompress, faCopy, faCreditCard,
  faCrown, faCube, faDatabase, faDesktop, faDisplay, faDoorOpen, faDownload, faDumbbell,
  faEllipsis, faEllipsisVertical, faEnvelope, faExpand, faEye, faEyeSlash, faFaceFrown,
  faFaceMeh, faFaceSmile, faFile, faFileCircleCheck, faFileLines, faFileMedical,
  faFileSignature, faFilter, faFire, faFlag, faFlask, faFloppyDisk, faFolderOpen, faGaugeSimple,
  faGear, faGlobe, faGraduationCap, faHandHoldingHeart, faHandshake, faHashtag, faHeadphones,
  faHeart, faHeartPulse, faHourglassHalf, faHouse, faImage, faInbox, faKey, faLandmark,
  faLanguage, faLaptop, faLayerGroup, faLightbulb, faLink, faLinkSlash, faList, faListCheck,
  faLocationCrosshairs, faLocationDot, faLock, faMagnifyingGlass, faMap, faMapLocationDot,
  faMessage, faMicrophone, faMicrophoneSlash, faMinus, faMobileScreen, faMoneyBill,
  faMoneyBillWave, faMoon, faNewspaper, faNotesMedical, faPaperPlane, faPaperclip, faPause,
  faPen, faPenToSquare, faPercent, faPhone, faPhoneSlash, faPhoneVolume, faPills, faPlay,
  faPlug, faPlugCircleXmark, faPlus, faPrint, faQrcode, faQuoteLeft, faReceipt,
  faRectangleXmark, faRepeat, faReply, faRightFromBracket, faRightToBracket, faRocket,
  faRotateLeft, faScaleBalanced, faShare, faShareNodes, faShield, faShieldHalved, faShoePrints,
  faSliders, faSquare, faStar, faStethoscope, faStopwatch, faStore, faSun, faTableCellsLarge,
  faTableColumns, faTag, faTags, faTemperatureHalf, faTerminal, faThumbsUp, faTrash, faTrashCan,
  faTriangleExclamation, faTv, faUpload, faUser, faUserCheck, faUserGear, faUserGroup,
  faUserPlus, faUserXmark, faUsers, faVideo, faVideoSlash, faVolumeHigh, faVolumeXmark,
  faWallet, faWeightScale, faWifi, faWrench, faXmark,
} from '@fortawesome/free-solid-svg-icons'
import { cn } from '@/lib/utils'

/** Brand colour presets. Any text-* class works too and wins over the tone. */
export const ICON_TONES = {
  brand: 'text-rh-teal dark:text-rh-aqua',
  deep: 'text-rh-night dark:text-rh-mint',
  accent: 'text-rh-lime',
  amber: 'text-rh-amber',
  muted: 'text-neutral-500 dark:text-neutral-400',
  inverse: 'text-white',
} as const

export type IconTone = keyof typeof ICON_TONES

export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, 'ref'> {
  /** Width and height in px (or any CSS length). Size classes like h-4 w-4 override it. */
  size?: number | string
  /** One of the brand colour presets. */
  tone?: IconTone
  /** Accepted for compatibility with older call sites; solid glyphs have no stroke. */
  strokeWidth?: number | string
  absoluteStrokeWidth?: boolean
}

export type IconComponent = React.ForwardRefExoticComponent<IconProps & React.RefAttributes<SVGSVGElement>>

// Glyphs sit inside a square box with a little breathing room, so wide and
// narrow icons line up and match the optical size the layouts were built for.
const BOX_PADDING = 1.2

export const Icon = React.forwardRef<SVGSVGElement, IconProps & { icon: IconDefinition; rotation?: number }>(
  function Icon(
    { icon, rotation, size = 24, tone, color, className, strokeWidth: _strokeWidth, absoluteStrokeWidth: _absolute, ...rest },
    ref,
  ) {
    const [width, height, , , pathData] = icon.icon
    const side = Math.max(width, height) * BOX_PADDING
    const paths = Array.isArray(pathData) ? pathData : [pathData]
    const labelled = rest['aria-label'] != null || rest['aria-labelledby'] != null
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`${(width - side) / 2} ${(height - side) / 2} ${side} ${side}`}
        width={size}
        height={size}
        fill={color ?? 'currentColor'}
        focusable="false"
        aria-hidden={labelled ? undefined : true}
        role={labelled ? 'img' : undefined}
        data-icon={icon.iconName}
        className={cn(tone && ICON_TONES[tone], className)}
        {...rest}
      >
        {rotation ? (
          <g transform={`rotate(${rotation} ${width / 2} ${height / 2})`}>
            {paths.map((d) => <path key={d} d={d} />)}
          </g>
        ) : (
          paths.map((d) => <path key={d} d={d} />)
        )}
      </svg>
    )
  },
)

function createIcon(name: string, icon: IconDefinition, rotation?: number): IconComponent {
  const Component = React.forwardRef<SVGSVGElement, IconProps>((props, ref) => (
    <Icon ref={ref} icon={icon} rotation={rotation} {...props} />
  ))
  Component.displayName = name
  return Component
}

export const Activity = /*#__PURE__*/ createIcon('Activity', faHeartPulse)
export const AlertCircle = /*#__PURE__*/ createIcon('AlertCircle', faCircleExclamation)
export const AlertTriangle = /*#__PURE__*/ createIcon('AlertTriangle', faTriangleExclamation)
export const AlignLeft = /*#__PURE__*/ createIcon('AlignLeft', faAlignLeft)
export const Archive = /*#__PURE__*/ createIcon('Archive', faBoxArchive)
export const ArchiveRestore = /*#__PURE__*/ createIcon('ArchiveRestore', faBoxOpen)
export const ArrowDown = /*#__PURE__*/ createIcon('ArrowDown', faArrowDown)
export const ArrowDownRight = /*#__PURE__*/ createIcon('ArrowDownRight', faArrowRight, 45)
export const ArrowLeft = /*#__PURE__*/ createIcon('ArrowLeft', faArrowLeft)
export const ArrowLeftRight = /*#__PURE__*/ createIcon('ArrowLeftRight', faArrowRightArrowLeft)
export const ArrowRight = /*#__PURE__*/ createIcon('ArrowRight', faArrowRight)
export const ArrowRightLeft = /*#__PURE__*/ createIcon('ArrowRightLeft', faArrowRightArrowLeft)
export const ArrowUp = /*#__PURE__*/ createIcon('ArrowUp', faArrowUp)
export const ArrowUpRight = /*#__PURE__*/ createIcon('ArrowUpRight', faArrowRight, -45)
export const Award = /*#__PURE__*/ createIcon('Award', faAward)
export const Baby = /*#__PURE__*/ createIcon('Baby', faBaby)
export const BadgeCheck = /*#__PURE__*/ createIcon('BadgeCheck', faCircleCheck)
export const BadgePercent = /*#__PURE__*/ createIcon('BadgePercent', faPercent)
export const Banknote = /*#__PURE__*/ createIcon('Banknote', faMoneyBill)
export const BarChart3 = /*#__PURE__*/ createIcon('BarChart3', faChartColumn)
export const Bell = /*#__PURE__*/ createIcon('Bell', faBell)
export const BellRing = /*#__PURE__*/ createIcon('BellRing', faBell)
export const Bone = /*#__PURE__*/ createIcon('Bone', faBone)
export const BookOpen = /*#__PURE__*/ createIcon('BookOpen', faBookOpen)
export const Box = /*#__PURE__*/ createIcon('Box', faBox)
export const Brain = /*#__PURE__*/ createIcon('Brain', faBrain)
export const Briefcase = /*#__PURE__*/ createIcon('Briefcase', faBriefcase)
export const Building = /*#__PURE__*/ createIcon('Building', faBuilding)
export const Building2 = /*#__PURE__*/ createIcon('Building2', faBuilding)
export const Calendar = /*#__PURE__*/ createIcon('Calendar', faCalendar)
export const CalendarCheck = /*#__PURE__*/ createIcon('CalendarCheck', faCalendarCheck)
export const CalendarClock = /*#__PURE__*/ createIcon('CalendarClock', faCalendarDay)
export const CalendarDays = /*#__PURE__*/ createIcon('CalendarDays', faCalendarDays)
export const CalendarOff = /*#__PURE__*/ createIcon('CalendarOff', faCalendarXmark)
export const CalendarPlus = /*#__PURE__*/ createIcon('CalendarPlus', faCalendarPlus)
export const CalendarRange = /*#__PURE__*/ createIcon('CalendarRange', faCalendarWeek)
export const CalendarX = /*#__PURE__*/ createIcon('CalendarX', faCalendarXmark)
export const Camera = /*#__PURE__*/ createIcon('Camera', faCamera)
export const Car = /*#__PURE__*/ createIcon('Car', faCar)
export const Check = /*#__PURE__*/ createIcon('Check', faCheck)
export const CheckCheck = /*#__PURE__*/ createIcon('CheckCheck', faCheckDouble)
export const CheckCircle = /*#__PURE__*/ createIcon('CheckCircle', faCircleCheck)
export const CheckCircle2 = /*#__PURE__*/ createIcon('CheckCircle2', faCircleCheck)
export const CheckIcon = /*#__PURE__*/ createIcon('CheckIcon', faCheck)
export const ChevronDown = /*#__PURE__*/ createIcon('ChevronDown', faChevronDown)
export const ChevronDownIcon = /*#__PURE__*/ createIcon('ChevronDownIcon', faChevronDown)
export const ChevronLeft = /*#__PURE__*/ createIcon('ChevronLeft', faChevronLeft)
export const ChevronRight = /*#__PURE__*/ createIcon('ChevronRight', faChevronRight)
export const ChevronUp = /*#__PURE__*/ createIcon('ChevronUp', faChevronUp)
export const ChevronUpIcon = /*#__PURE__*/ createIcon('ChevronUpIcon', faChevronUp)
export const Circle = /*#__PURE__*/ createIcon('Circle', faCircle)
export const CircleIcon = /*#__PURE__*/ createIcon('CircleIcon', faCircle)
export const ClipboardCheck = /*#__PURE__*/ createIcon('ClipboardCheck', faClipboardCheck)
export const ClipboardList = /*#__PURE__*/ createIcon('ClipboardList', faClipboardList)
export const Clock = /*#__PURE__*/ createIcon('Clock', faClock)
export const Clock3 = /*#__PURE__*/ createIcon('Clock3', faClock)
export const Code = /*#__PURE__*/ createIcon('Code', faCode)
export const Code2 = /*#__PURE__*/ createIcon('Code2', faCode)
export const Copy = /*#__PURE__*/ createIcon('Copy', faCopy)
export const CornerDownLeft = /*#__PURE__*/ createIcon('CornerDownLeft', faArrowTurnDown, 90)
export const CreditCard = /*#__PURE__*/ createIcon('CreditCard', faCreditCard)
export const Crown = /*#__PURE__*/ createIcon('Crown', faCrown)
export const Database = /*#__PURE__*/ createIcon('Database', faDatabase)
export const DollarSign = /*#__PURE__*/ createIcon('DollarSign', faMoneyBillWave)
export const DoorOpen = /*#__PURE__*/ createIcon('DoorOpen', faDoorOpen)
export const Download = /*#__PURE__*/ createIcon('Download', faDownload)
export const Dumbbell = /*#__PURE__*/ createIcon('Dumbbell', faDumbbell)
export const Edit = /*#__PURE__*/ createIcon('Edit', faPenToSquare)
export const ExternalLink = /*#__PURE__*/ createIcon('ExternalLink', faArrowUpRightFromSquare)
export const Eye = /*#__PURE__*/ createIcon('Eye', faEye)
export const EyeOff = /*#__PURE__*/ createIcon('EyeOff', faEyeSlash)
export const File = /*#__PURE__*/ createIcon('File', faFile)
export const FileCheck = /*#__PURE__*/ createIcon('FileCheck', faFileCircleCheck)
export const FileHeart = /*#__PURE__*/ createIcon('FileHeart', faFileMedical)
export const FileSignature = /*#__PURE__*/ createIcon('FileSignature', faFileSignature)
export const FileText = /*#__PURE__*/ createIcon('FileText', faFileLines)
export const FileTextIcon = /*#__PURE__*/ createIcon('FileTextIcon', faFileLines)
export const Filter = /*#__PURE__*/ createIcon('Filter', faFilter)
export const Flag = /*#__PURE__*/ createIcon('Flag', faFlag)
export const Flame = /*#__PURE__*/ createIcon('Flame', faFire)
export const FlaskConical = /*#__PURE__*/ createIcon('FlaskConical', faFlask)
export const FolderOpen = /*#__PURE__*/ createIcon('FolderOpen', faFolderOpen)
export const Footprints = /*#__PURE__*/ createIcon('Footprints', faShoePrints)
export const Frown = /*#__PURE__*/ createIcon('Frown', faFaceFrown)
export const Globe = /*#__PURE__*/ createIcon('Globe', faGlobe)
export const GraduationCap = /*#__PURE__*/ createIcon('GraduationCap', faGraduationCap)
export const HandHeart = /*#__PURE__*/ createIcon('HandHeart', faHandHoldingHeart)
export const Handshake = /*#__PURE__*/ createIcon('Handshake', faHandshake)
export const Hash = /*#__PURE__*/ createIcon('Hash', faHashtag)
export const Headphones = /*#__PURE__*/ createIcon('Headphones', faHeadphones)
export const Heart = /*#__PURE__*/ createIcon('Heart', faHeart)
export const HeartHandshake = /*#__PURE__*/ createIcon('HeartHandshake', faHandHoldingHeart)
export const HeartPulse = /*#__PURE__*/ createIcon('HeartPulse', faHeartPulse)
export const HelpCircle = /*#__PURE__*/ createIcon('HelpCircle', faCircleQuestion)
export const History = /*#__PURE__*/ createIcon('History', faClockRotateLeft)
export const Home = /*#__PURE__*/ createIcon('Home', faHouse)
export const Hourglass = /*#__PURE__*/ createIcon('Hourglass', faHourglassHalf)
export const House = /*#__PURE__*/ createIcon('House', faHouse)
export const ImageIcon = /*#__PURE__*/ createIcon('ImageIcon', faImage)
export const ImagePlus = /*#__PURE__*/ createIcon('ImagePlus', faImage)
export const ImageUp = /*#__PURE__*/ createIcon('ImageUp', faImage)
export const Inbox = /*#__PURE__*/ createIcon('Inbox', faInbox)
export const Info = /*#__PURE__*/ createIcon('Info', faCircleInfo)
export const Instagram = /*#__PURE__*/ createIcon('Instagram', faInstagram)
export const Key = /*#__PURE__*/ createIcon('Key', faKey)
export const KeyRound = /*#__PURE__*/ createIcon('KeyRound', faKey)
export const Landmark = /*#__PURE__*/ createIcon('Landmark', faLandmark)
export const Languages = /*#__PURE__*/ createIcon('Languages', faLanguage)
export const Laptop = /*#__PURE__*/ createIcon('Laptop', faLaptop)
export const Layers = /*#__PURE__*/ createIcon('Layers', faLayerGroup)
export const LayoutDashboard = /*#__PURE__*/ createIcon('LayoutDashboard', faTableCellsLarge)
export const Library = /*#__PURE__*/ createIcon('Library', faBook)
export const Lightbulb = /*#__PURE__*/ createIcon('Lightbulb', faLightbulb)
export const LineChart = /*#__PURE__*/ createIcon('LineChart', faChartLine)
export const Link = /*#__PURE__*/ createIcon('Link', faLink)
export const Link2 = /*#__PURE__*/ createIcon('Link2', faLink)
export const Link2Off = /*#__PURE__*/ createIcon('Link2Off', faLinkSlash)
export const Linkedin = /*#__PURE__*/ createIcon('Linkedin', faLinkedin)
export const List = /*#__PURE__*/ createIcon('List', faList)
export const ListChecks = /*#__PURE__*/ createIcon('ListChecks', faListCheck)
export const ListPlus = /*#__PURE__*/ createIcon('ListPlus', faPlus)
export const Loader2 = /*#__PURE__*/ createIcon('Loader2', faCircleNotch)
export const LocateFixed = /*#__PURE__*/ createIcon('LocateFixed', faLocationCrosshairs)
export const Lock = /*#__PURE__*/ createIcon('Lock', faLock)
export const LogIn = /*#__PURE__*/ createIcon('LogIn', faRightToBracket)
export const LogOut = /*#__PURE__*/ createIcon('LogOut', faRightFromBracket)
export const Mail = /*#__PURE__*/ createIcon('Mail', faEnvelope)
export const MailQuestion = /*#__PURE__*/ createIcon('MailQuestion', faEnvelope)
export const Map = /*#__PURE__*/ createIcon('Map', faMap)
export const MapPin = /*#__PURE__*/ createIcon('MapPin', faLocationDot)
export const MapPinned = /*#__PURE__*/ createIcon('MapPinned', faMapLocationDot)
export const MapPinOff = /*#__PURE__*/ createIcon('MapPinOff', faMapLocationDot)
export const Maximize = /*#__PURE__*/ createIcon('Maximize', faExpand)
export const Megaphone = /*#__PURE__*/ createIcon('Megaphone', faBullhorn)
export const Meh = /*#__PURE__*/ createIcon('Meh', faFaceMeh)
export const Menu = /*#__PURE__*/ createIcon('Menu', faBars)
export const MessageCircle = /*#__PURE__*/ createIcon('MessageCircle', faComment)
export const MessageSquare = /*#__PURE__*/ createIcon('MessageSquare', faMessage)
export const Mic = /*#__PURE__*/ createIcon('Mic', faMicrophone)
export const MicOff = /*#__PURE__*/ createIcon('MicOff', faMicrophoneSlash)
export const Minimize = /*#__PURE__*/ createIcon('Minimize', faCompress)
export const Minus = /*#__PURE__*/ createIcon('Minus', faMinus)
export const Monitor = /*#__PURE__*/ createIcon('Monitor', faDesktop)
export const MonitorOff = /*#__PURE__*/ createIcon('MonitorOff', faRectangleXmark)
export const MonitorPlay = /*#__PURE__*/ createIcon('MonitorPlay', faTv)
export const MonitorUp = /*#__PURE__*/ createIcon('MonitorUp', faDisplay)
export const Moon = /*#__PURE__*/ createIcon('Moon', faMoon)
export const MoreHorizontal = /*#__PURE__*/ createIcon('MoreHorizontal', faEllipsis)
export const MoreVertical = /*#__PURE__*/ createIcon('MoreVertical', faEllipsisVertical)
export const Newspaper = /*#__PURE__*/ createIcon('Newspaper', faNewspaper)
export const NotebookPen = /*#__PURE__*/ createIcon('NotebookPen', faNotesMedical)
export const Package = /*#__PURE__*/ createIcon('Package', faBox)
export const PanelLeftIcon = /*#__PURE__*/ createIcon('PanelLeftIcon', faTableColumns)
export const Paperclip = /*#__PURE__*/ createIcon('Paperclip', faPaperclip)
export const PartyPopper = /*#__PURE__*/ createIcon('PartyPopper', faCheckDouble)
export const Pause = /*#__PURE__*/ createIcon('Pause', faPause)
export const Pencil = /*#__PURE__*/ createIcon('Pencil', faPen)
export const Percent = /*#__PURE__*/ createIcon('Percent', faPercent)
export const Phone = /*#__PURE__*/ createIcon('Phone', faPhone)
export const PhoneCall = /*#__PURE__*/ createIcon('PhoneCall', faPhoneVolume)
export const PhoneOff = /*#__PURE__*/ createIcon('PhoneOff', faPhoneSlash)
export const Pill = /*#__PURE__*/ createIcon('Pill', faPills)
export const Play = /*#__PURE__*/ createIcon('Play', faPlay)
export const PlayCircle = /*#__PURE__*/ createIcon('PlayCircle', faCirclePlay)
export const Plus = /*#__PURE__*/ createIcon('Plus', faPlus)
export const Printer = /*#__PURE__*/ createIcon('Printer', faPrint)
export const QrCode = /*#__PURE__*/ createIcon('QrCode', faQrcode)
export const Quote = /*#__PURE__*/ createIcon('Quote', faQuoteLeft)
export const Receipt = /*#__PURE__*/ createIcon('Receipt', faReceipt)
export const ReceiptText = /*#__PURE__*/ createIcon('ReceiptText', faReceipt)
export const RefreshCw = /*#__PURE__*/ createIcon('RefreshCw', faArrowsRotate)
export const Repeat = /*#__PURE__*/ createIcon('Repeat', faRepeat)
export const Reply = /*#__PURE__*/ createIcon('Reply', faReply)
export const Rocket = /*#__PURE__*/ createIcon('Rocket', faRocket)
export const Rotate3d = /*#__PURE__*/ createIcon('Rotate3d', faCube)
export const RotateCcw = /*#__PURE__*/ createIcon('RotateCcw', faRotateLeft)
export const Save = /*#__PURE__*/ createIcon('Save', faFloppyDisk)
export const Scale = /*#__PURE__*/ createIcon('Scale', faScaleBalanced)
export const Search = /*#__PURE__*/ createIcon('Search', faMagnifyingGlass)
export const SearchX = /*#__PURE__*/ createIcon('SearchX', faMagnifyingGlass)
export const Send = /*#__PURE__*/ createIcon('Send', faPaperPlane)
export const Settings = /*#__PURE__*/ createIcon('Settings', faGear)
export const Settings2 = /*#__PURE__*/ createIcon('Settings2', faSliders)
export const Share = /*#__PURE__*/ createIcon('Share', faShare)
export const Share2 = /*#__PURE__*/ createIcon('Share2', faShareNodes)
export const Shield = /*#__PURE__*/ createIcon('Shield', faShield)
export const ShieldAlert = /*#__PURE__*/ createIcon('ShieldAlert', faTriangleExclamation)
export const ShieldCheck = /*#__PURE__*/ createIcon('ShieldCheck', faShieldHalved)
export const ShieldOff = /*#__PURE__*/ createIcon('ShieldOff', faBan)
export const SlidersHorizontal = /*#__PURE__*/ createIcon('SlidersHorizontal', faSliders)
export const Smartphone = /*#__PURE__*/ createIcon('Smartphone', faMobileScreen)
export const Smile = /*#__PURE__*/ createIcon('Smile', faFaceSmile)
export const Square = /*#__PURE__*/ createIcon('Square', faSquare)
export const Star = /*#__PURE__*/ createIcon('Star', faStar)
export const StarOff = /*#__PURE__*/ createIcon('StarOff', faStar)
export const Stethoscope = /*#__PURE__*/ createIcon('Stethoscope', faStethoscope)
export const Store = /*#__PURE__*/ createIcon('Store', faStore)
export const Sun = /*#__PURE__*/ createIcon('Sun', faSun)
export const SwitchCamera = /*#__PURE__*/ createIcon('SwitchCamera', faCameraRotate)
export const Tag = /*#__PURE__*/ createIcon('Tag', faTag)
export const Tags = /*#__PURE__*/ createIcon('Tags', faTags)
export const Target = /*#__PURE__*/ createIcon('Target', faBullseye)
export const Terminal = /*#__PURE__*/ createIcon('Terminal', faTerminal)
export const Thermometer = /*#__PURE__*/ createIcon('Thermometer', faTemperatureHalf)
export const ThumbsUp = /*#__PURE__*/ createIcon('ThumbsUp', faThumbsUp)
export const Timer = /*#__PURE__*/ createIcon('Timer', faStopwatch)
export const Trash = /*#__PURE__*/ createIcon('Trash', faTrash)
export const Trash2 = /*#__PURE__*/ createIcon('Trash2', faTrashCan)
export const TrendingDown = /*#__PURE__*/ createIcon('TrendingDown', faArrowTrendDown)
export const TrendingUp = /*#__PURE__*/ createIcon('TrendingUp', faArrowTrendUp)
export const TriangleAlert = /*#__PURE__*/ createIcon('TriangleAlert', faTriangleExclamation)
export const Turtle = /*#__PURE__*/ createIcon('Turtle', faGaugeSimple)
export const Twitter = /*#__PURE__*/ createIcon('Twitter', faXTwitter)
export const Undo2 = /*#__PURE__*/ createIcon('Undo2', faArrowRotateLeft)
export const Upload = /*#__PURE__*/ createIcon('Upload', faUpload)
export const UploadCloud = /*#__PURE__*/ createIcon('UploadCloud', faCloudArrowUp)
export const User = /*#__PURE__*/ createIcon('User', faUser)
export const UserCheck = /*#__PURE__*/ createIcon('UserCheck', faUserCheck)
export const UserCog = /*#__PURE__*/ createIcon('UserCog', faUserGear)
export const UserPlus = /*#__PURE__*/ createIcon('UserPlus', faUserPlus)
export const UserRound = /*#__PURE__*/ createIcon('UserRound', faUser)
export const Users = /*#__PURE__*/ createIcon('Users', faUsers)
export const Users2 = /*#__PURE__*/ createIcon('Users2', faUserGroup)
export const UserSearch = /*#__PURE__*/ createIcon('UserSearch', faMagnifyingGlass)
export const UserX = /*#__PURE__*/ createIcon('UserX', faUserXmark)
export const Video = /*#__PURE__*/ createIcon('Video', faVideo)
export const VideoOff = /*#__PURE__*/ createIcon('VideoOff', faVideoSlash)
export const Volume2 = /*#__PURE__*/ createIcon('Volume2', faVolumeHigh)
export const VolumeX = /*#__PURE__*/ createIcon('VolumeX', faVolumeXmark)
export const Wallet = /*#__PURE__*/ createIcon('Wallet', faWallet)
export const WalletCards = /*#__PURE__*/ createIcon('WalletCards', faWallet)
export const Webhook = /*#__PURE__*/ createIcon('Webhook', faPlug)
export const Weight = /*#__PURE__*/ createIcon('Weight', faWeightScale)
export const WhatsApp = /*#__PURE__*/ createIcon('WhatsApp', faWhatsapp)
export const Wifi = /*#__PURE__*/ createIcon('Wifi', faWifi)
export const WifiOff = /*#__PURE__*/ createIcon('WifiOff', faPlugCircleXmark)
export const Wrench = /*#__PURE__*/ createIcon('Wrench', faWrench)
export const X = /*#__PURE__*/ createIcon('X', faXmark)
export const XCircle = /*#__PURE__*/ createIcon('XCircle', faCircleXmark)
export const XIcon = /*#__PURE__*/ createIcon('XIcon', faXmark)
export const XOctagon = /*#__PURE__*/ createIcon('XOctagon', faCircleXmark)
export const Zap = /*#__PURE__*/ createIcon('Zap', faBolt)
