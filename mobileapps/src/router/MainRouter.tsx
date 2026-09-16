import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import FaceAbsensiScreen from 'features/faceAbsensi/FaceAbsensiScreen'
import HomeScreen from 'features/home/HomeScreen'
import AttendancePreviewScreen from 'features/attendance/AttendancePreviewScreen'
import FaceListScreen from 'features/facelist/FaceListScreen'
import FormAddFace from 'features/facelist/FormAddFace'
import CaptureFoto from 'features/facelist/CaptureFoto'

export type RootStackParamList = {
  Home: undefined
  FaceAbsensi: undefined
  AttendancePreview: undefined
  FaceList: undefined
  FormAddFace: undefined
  CaptureFoto: undefined
}

const MainStack = createNativeStackNavigator<RootStackParamList>()

const MainRouter: React.FC = () => {
  return (
    <MainStack.Navigator initialRouteName="Home">
      <MainStack.Screen name="Home" component={HomeScreen} />
      <MainStack.Screen name="FaceList" options={{
        title: "Daftar Wajah"
      }} component={FaceListScreen} />
      <MainStack.Screen name="FormAddFace" component={FormAddFace} />
      <MainStack.Screen name="CaptureFoto" component={CaptureFoto} />
      <MainStack.Screen
        name="FaceAbsensi"
        component={FaceAbsensiScreen}
        options={{ headerShown: false }}
      />
      <MainStack.Screen
        name="AttendancePreview"
        component={AttendancePreviewScreen}
        options={{ title: 'Detail Absensi' }}
      />
    </MainStack.Navigator>
  )
}

export default MainRouter
