{-# LANGUAGE StandaloneDeriving #-}
-- {-# LANGUAGE TypeSynonymInstances #-}
--{-# LANGUAGE GeneralizedNewtypeDeriving #-}
--{-# LANGUAGE FlexibleContexts #-}
--{-# LANGUAGE UndecidableInstances #-}
module Message (
  NetworkMessage(..), 
  ServerMessage(..),
  StampedMessage(..),
  StampedServerMessage, 
  StampedNetworkMessage,
  Notification(..), 
  ProcessLog(..), 
  StorageEvent(..), 
  Patch(..),
  OperationId,
  stampServerMessage,
  stampClientMessage,
  showSummary,
  showStampedSummary
) where

-- Standard modules
import qualified Data.Text as T
import Data.Text (Text)
--import Data.Time.Clock (UTCTime(..), getCurrentTime)
import Data.Time (UTCTime(..), getCurrentTime)
import System.Exit (ExitCode)
import qualified Text.Read as Read

-- Supporting modules
-- https://github.com/timjb/haskell-operational-transformation
import qualified Control.OperationalTransformation.Text as OT

-- Application modules
import FileStore
import Client (HostId, serverId)
import qualified OTServer as OT (Revision)

type OperationId = String

-- Messages sent between clients and the server (and possibly between clients as well)
data NetworkMessage = Acknowledge
                    | Notify Notification
                    | ReloadFiles StorageEvent [FilePath]
                    | LoadFile StorageEvent FilePath
                    | UnloadFile StorageEvent FilePath
                    | LoadFileContents FilePath OT.Revision FileContents
                    | UnloadFileContents FilePath
                    | OperationalTransform FilePath OT.Revision [OT.Action] OperationId
                    | ParseError String
  deriving (Show, Read)
  
-- Server generated messages (to be processed locally)
data ServerMessage = ServerNotify Notification
                   | ServerReloadFiles StorageEvent [FilePath]
                   | ServerLoadFile StorageEvent FilePath
                   | ServerUnloadFile StorageEvent FilePath
                   | ServerLoadFileContents FilePath FileContents
                   | ServerLoadModifications FilePath
                   | ServerOperationalTransform FilePath OT.Revision [OT.Action] OperationId
                   | ServerExecuteAll
  deriving (Show, Read)

-- A message stamped with the origin host identifier and (server) time stamp
data TimeStamp = TimeStamp UTCTime

instance Show TimeStamp where
  showsPrec d (TimeStamp t) =
    showParen (d > app_prec) $  
      showString $ "TimeStamp \"" ++ show t ++ "\""
    where app_prec = 10
  
instance Read TimeStamp where
  readPrec = 
    Read.parens $ Read.prec app_prec $ do
      Read.Ident "TimeStamp" <- Read.lexP
      time <- Read.step Read.readPrec
      return $ TimeStamp time
    where app_prec = 10
  
data StampedMessage m = StampedMessage HostId TimeStamp m
  deriving (Show, Read)

type StampedServerMessage = StampedMessage ServerMessage
type StampedNetworkMessage = StampedMessage NetworkMessage
  
-- Notifications can be attached to certain messages
data Notification = Info String
                  | ClientDisconnected String
                  | ProcessMessage FilePath ProcessLog
  deriving (Show, Read)
  
-- The log messages from a running process may be sent as a notification
data ProcessLog = LogStart
                | LogInfo String
                | LogError String
                | LogEnd ExitCode -- TODO: add exit code?
  deriving (Show, Read)

-- Certain messages carry storage events
data StorageEvent = WatchInstalled
                  | Connected
                  | ModifiedFile
                  | ModifiedDirectory
                  | MovedOutFile
                  | MovedInFile
                  | RenamedFile
                  | MovedOutDirectory
                  | MovedInDirectory
                  | RenamedDirectory
                  | MovedOutRootDirectory
                  | RestoredRootDirectory
                  | CreatedFile
                  | CreatedDirectory
                  | DeletedFile
                  | DeletedDirectory
                  | DeletedRootDirectory
                  | UnmountedRootDirectory
                  | Error
  deriving (Show, Read)

-- Patch information for messages that carry text diffs
data Patch = D Text
  deriving (Show, Read)
  
-- Shorthand method to stamp a message originating from the server
stampServerMessage :: m -> IO (StampedMessage m)
stampServerMessage m = do 
  t <- getCurrentTime
  return $ StampedMessage serverId (TimeStamp t) m
  
stampClientMessage :: HostId -> m -> IO (StampedMessage m)
stampClientMessage cid m = do 
  t <- getCurrentTime
  return $ StampedMessage cid (TimeStamp t) m
  
-- Serialize a message summary (similar to `show`, but used for logging)
showStampedSummary :: StampedNetworkMessage -> Text
showStampedSummary (StampedMessage cid time message) =
  (if cid == 0 then T.pack "Server" else T.pack "Client #" `T.append` T.pack (show cid))
  `T.append` T.pack " ("
  --`T.append` (T.pack $ formatTime defaultTimeLocale "(%Y/%m/%d %H:%M): " time)
  `T.append` (T.pack $ show time)
  `T.append` T.pack "): "
  `T.append` (showSummary message)

showSummary :: NetworkMessage -> Text
showSummary (LoadFileContents f rev fc) = 
  T.pack "LoadFileContents "
  `T.append` (T.pack $ show f)
  `T.snoc` ' '
  `T.append` (T.pack $ show rev)
  `T.snoc` ' '
  `T.append` (showSummaryString fc)
showSummary (OperationalTransform path rev actions opId) =  
  T.pack "OperationalTransform " 
  `T.append` (T.pack $ show path) 
  `T.snoc` ' ' 
  `T.append` (T.pack $ show rev)
  `T.snoc` ' '
  `T.append` (showSummaryOTActions actions)
  `T.snoc` ' '
  `T.append` (T.pack $ show opId)
showSummary m = T.pack $ show m

showSummaryOTActions :: [OT.Action] -> Text
showSummaryOTActions actions = '['
  `T.cons` (if length actions > 5
    then (T.intercalate (T.pack ",") $ map showAction $ take 5 actions) `T.append` T.pack ",...]"  
    else (T.intercalate (T.pack ",") $ map showAction actions) `T.snoc` ']')
  where
    showAction (OT.Insert str) = (T.pack "Insert ") `T.append` showSummaryString str 
    showAction a               = T.pack $ show a

showSummaryString :: Text -> Text
showSummaryString str = '\"' 
  `T.cons` (if T.length str > 25
    then (replaceNewlinesTabs $ T.take 25 str) `T.append` (T.pack "...\"")   
    else (replaceNewlinesTabs str) `T.snoc` '\"')
  where
    replaceNewlinesTabs = T.unwords . T.split (`elem` ['\n', '\t'])
