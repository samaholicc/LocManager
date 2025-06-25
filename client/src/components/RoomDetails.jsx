import React, { useEffect, useState } from "react";
import axios from "axios";
import { useTheme } from "../context/ThemeContext"; // Import the useTheme hook

function RoomDetails(props) {
  const { darkMode } = useTheme(); // Access darkMode from the theme context

  const roomDetailsHeader = [
    "Numéro de chambre",
    "Type de chambre",
    "Numéro d'étage",
    "Numéro d'enregistrement",
    "Numéro de bloc",
    "Place de parking",
  ];
  const [roomRows, setRoomRows] = useState([]);

  const getRoomRows = async () => {
    try {
      const userId = JSON.parse(window.localStorage.getItem("whom"))?.username;
      if (!userId) {
        console.error("No userId found in localStorage");
        return;
      }
      const res = await axios.post(`${process.env.REACT_APP_SERVER}/ownerroomdetails`, {
        userId,
      });
      setRoomRows(res.data);
    } catch (error) {
      console.log(error);
    }
  };

  useEffect(() => {
    getRoomRows();
  }, []);

  // If there's no userId, return a message
  const userId = JSON.parse(window.localStorage.getItem("whom"))?.username;
  if (!userId) {
    return (
      <section className="pr-5 px-10 py-20 bg-gray-100 dark:bg-gray-900">
        <div className="container card overflow-hidden bg-white dark:bg-gray-800 shadow-md dark:shadow-lg">
          <p className="text-center text-red-500 dark:text-red-400">Please log in to view room details.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="pr-5 px-10 py-20 bg-gray-100 dark:bg-gray-900">
      <div className="container card overflow-hidden bg-white dark:bg-gray-800 shadow-md dark:shadow-lg">
        <div className="flex flex-wrap -mx-4">
          <div className="w-full px-4">
            <div className="max-w-full overflow-x-auto">
              <table className="table-auto w-full">
                <thead>
                  <tr className="bg-blue-500 dark:bg-blue-700 text-center">
                    {roomDetailsHeader.map((ele, index) => (
                      <th
                        key={index + 1}
                        className="
                          w-1/6
                          min-w-[160px]
                          text-lg
                          font-semibold
                          text-white
                          dark:text-gray-100
                          py-4
                          lg:py-7       
                          px-3
                          lg:px-4
                          border-l border-transparent
                        "
                      >
                        {ele}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {roomRows.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="text-center py-5 text-gray-500 dark:text-gray-400">
                        No rooms found.
                      </td>
                    </tr>
                  ) : (
                    roomRows.map((ele, index) => (
                      <tr key={index + 1}>
                        <td
                          className="
                            text-center
                            font-medium
                            text-base
                            py-5
                            px-2
                            bg-white
                            dark:bg-gray-800
                            text-gray-800
                            dark:text-gray-200
                            border-b border-l border-[#E8E8E8]
                            dark:border-gray-700
                          "
                        >
                          {ele.room_no}
                        </td>
                        <td
                          className="
                            text-center
                            font-medium
                            text-base
                            py-5
                            px-2
                            bg-white
                            dark:bg-gray-800
                            text-gray-800
                            dark:text-gray-200
                            border-b border-l border-[#E8E8E8]
                            dark:border-gray-700
                          "
                        >
                          {ele.type}
                        </td>
                        <td
                          className="
                            text-center
                            font-medium
                            text-base
                            py-5
                            px-2
                            bg-white
                            dark:bg-gray-800
                            text-gray-800
                            dark:text-gray-200
                            border-b border-l border-[#E8E8E8]
                            dark:border-gray-700
                          "
                        >
                          {ele.floor}
                        </td>
                        <td
                          className="
                            text-center
                            font-medium
                            text-base
                            py-5
                            px-2
                            bg-white
                            dark:bg-gray-800
                            text-gray-800
                            dark:text-gray-200
                            border-b border-l border-[#E8E8E8]
                            dark:border-gray-700
                          "
                        >
                          {ele.reg_no}
                        </td>
                        <td
                          className="
                            text-center
                            font-medium
                            text-base
                            py-5
                            px-2
                            bg-white
                            dark:bg-gray-800
                            text-gray-800
                            dark:text-gray-200
                            border-b border-l border-[#E8E8E8]
                            dark:border-gray-700
                          "
                        >
                          {ele.block_no}
                        </td>
                        <td
                          className="
                            text-center
                            font-medium
                            text-base
                            py-5
                            px-2
                            bg-white
                            dark:bg-gray-800
                            text-gray-800
                            dark:text-gray-200
                            border-b border-l border-[#E8E8E8]
                            dark:border-gray-700
                          "
                        >
                          {ele.parking_slot}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default RoomDetails;